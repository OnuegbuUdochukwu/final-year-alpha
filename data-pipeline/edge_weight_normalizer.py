import os
import logging
from neo4j import GraphDatabase
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class EdgeWeightNormalizer:
    """Calculates and normalizes weights for the A* pathfinding algorithm."""

    def __init__(self):
        load_dotenv()
        self.neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD", "IloveAdeogomitide")
        
        self.neo_driver = GraphDatabase.driver(self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password))
        
        # Hyperparameters for A* Cost Function (can be tuned later via User Preferences)
        self.alpha = 0.3  # Cost priority
        self.beta = 0.4   # Time priority
        self.gamma = 0.3  # Market demand (Relevance) priority

    def close(self):
        self.neo_driver.close()

    def normalize_and_update(self):
        """
        1. Fetches all LEARN_VIA edges with their Cost, Time, and the Target skill's Demand Weight.
        2. Normalizes Cost and Time between 0.0 and 1.0.
        3. Applies the weight formula: W = alpha*NormCost + beta*NormTime + gamma*(1 / max(Demand, 0.1))
        4. Writes the final W back to the Neo4j Edge properties.
        """
        logger.info("Fetching edges for Weight Normalization from Neo4j...")

        # Neo4j 5+ uses elementId() instead of id() for robust internal locators
        fetch_query = """
        MATCH (s:Skill)-[e:LEARN_VIA]->(t:Skill)
        RETURN elementId(e) AS edge_id, e.cost AS cost, e.time AS time, t.demand_weight AS demand_weight
        """

        with self.neo_driver.session() as session:
            result = session.run(fetch_query)
            edges = [record.data() for record in result]

        if not edges:
            logger.warning("No edges found in Neo4j to normalize.")
            return

        # Extract max values for 0-1 Normalization
        max_cost = max([e['cost'] for e in edges])
        max_time = max([e['time'] for e in edges])
        
        # Prevent division by zero if all courses are uniquely free
        if max_cost == 0: max_cost = 1.0
        if max_time == 0: max_time = 1.0

        # Update edges in a single transaction payload
        update_query = """
        UNWIND $updates AS update
        MATCH ()-[e:LEARN_VIA]->() WHERE elementId(e) = update.edge_id
        SET e.normalized_weight = update.w
        """
        
        updates = []
        for e in edges:
            norm_cost = e['cost'] / max_cost
            norm_time = e['time'] / max_time
            
            # Demand weight is 0 to 1 from Phase 2. 
            # In pathfinding, high demand = low cost (a good path). So we take the inverse penalty.
            # Add 0.1 to avoid division by zero and smooth the penalty curve.
            demand_penalty = 1.0 / (e['demand_weight'] + 0.1) 

            # Calculate W
            w = (self.alpha * norm_cost) + (self.beta * norm_time) + (self.gamma * demand_penalty)
            
            # Ensure strictly positive weights for A* (Graph theory requires > 0 for standard metrics)
            w = max(w, 0.01)

            updates.append({
                "edge_id": e['edge_id'],
                "w": round(w, 4)
            })

        logger.info(f"Normalizing {len(updates)} edges using alpha={self.alpha}, beta={self.beta}, gamma={self.gamma}...")
        
        with self.neo_driver.session() as session:
            session.run(update_query, updates=updates)

        logger.info("Weight Normalization applied to Graph successfully.")

if __name__ == "__main__":
    normalizer = EdgeWeightNormalizer()
    normalizer.normalize_and_update()
    normalizer.close()
