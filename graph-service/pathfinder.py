import os
import logging
import networkx as nx
import numpy as np
from neo4j import GraphDatabase
from dotenv import load_dotenv
from scipy.spatial.distance import cosine

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class PathfinderGraphEngine:
    """Uses A* Algorithm to calculate the optimal learning path."""
    
    def __init__(self):
        load_dotenv()
        self.neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD", "password")
        
        self.neo_driver = GraphDatabase.driver(self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password))
        self.G = nx.DiGraph()
        
    def close(self):
        self.neo_driver.close()

    def build_networkx_graph(self):
        """Loads the Neo4j structure into memory for fast A* computation."""
        logger.info("Building NetworkX graph from Neo4j...")
        
        with self.neo_driver.session() as session:
            # Load Nodes and their Embeddings
            nodes_result = session.run("MATCH (n:Skill) RETURN elementId(n) as id, n.name as name, n.embedding as embedding")
            for record in nodes_result:
                self.G.add_node(
                    record["id"], 
                    name=record["name"], 
                    embedding=np.array(record["embedding"]) if record["embedding"] else None
                )

            # Load Edges and their Normalized Weights
            edges_result = session.run("MATCH (s:Skill)-[e:LEARN_VIA]->(t:Skill) RETURN elementId(s) as source, elementId(t) as target, e.normalized_weight as weight, e.title as title")
            for record in edges_result:
                self.G.add_edge(
                    record["source"], 
                    record["target"], 
                    weight=record["weight"],
                    title=record["title"]
                )
                
        logger.info(f"Loaded Graph with {self.G.number_of_nodes()} nodes and {self.G.number_of_edges()} edges.")

    def _heuristic(self, current_node, target_node):
        """
        A* Heuristic function h(n).
        Calculates the Cosine Distance (1 - Cosine Similarity) between the BERT embeddings.
        A smaller distance implies the 'current' skill is semantically closer to the 'target' skill.
        """
        curr_vector = self.G.nodes[current_node].get("embedding")
        target_vector = self.G.nodes[target_node].get("embedding")
        
        if curr_vector is None or target_vector is None:
            return 1.0 # Default distance penalty if missing embeddings
            
        # cosine() from scipy calculates distance natively (1 - similarity)
        return cosine(curr_vector, target_vector)

    def find_optimal_path(self, start_skill_name, target_skill_name):
        """Executes the A* pathfinding algorithm."""
        
        # Resolve names to internal Node IDs
        start_id, target_id = None, None
        for n, data in self.G.nodes(data=True):
            if data.get("name") and data["name"].lower() == start_skill_name.lower():
                start_id = n
            if data.get("name") and data["name"].lower() == target_skill_name.lower():
                target_id = n
                
        if not start_id:
            logger.error(f"Start skill '{start_skill_name}' not found in the graph.")
            return None
        if not target_id:
            logger.error(f"Target skill '{target_skill_name}' not found in the graph.")
            return None
            
        logger.info(f"Initiating A* Search from '{start_skill_name}' to '{target_skill_name}'...")
        
        try:
            # NetworkX built-in A* search. 
            # - 'weight' evaluates traversal cost (Cost/Time/Relevance scalar W)
            # - 'heuristic' biases the search semantically towards the target
            path_node_ids = nx.astar_path(
                self.G, 
                source=start_id, 
                target=target_id, 
                heuristic=self._heuristic, 
                weight='weight'
            )
            
            # Reconstruct the path metadata
            path_details = []
            total_weight = 0
            
            for i in range(len(path_node_ids) - 1):
                u = path_node_ids[i]
                v = path_node_ids[i+1]
                edge_data = self.G.get_edge_data(u, v)
                
                step = {
                    "from_node": self.G.nodes[u]["name"],
                    "to_node": self.G.nodes[v]["name"],
                    "course": edge_data["title"],
                    "weight": edge_data["weight"]
                }
                total_weight += edge_data["weight"]
                path_details.append(step)
                
            logger.info("Optimal path found successfully!")
            return {
                "path_nodes": [self.G.nodes[n]["name"] for n in path_node_ids],
                "steps": path_details,
                "total_heuristic_cost": round(total_weight, 4)
            }
            
        except nx.NetworkXNoPath:
            logger.warning(f"No valid path exists between '{start_skill_name}' and '{target_skill_name}'.")
            return None

if __name__ == "__main__":
    engine = PathfinderGraphEngine()
    engine.build_networkx_graph()
    
    # Test execution
    # Starting from absolute zero 'Foundation' trying to get to 'Machine Learning'
    route = engine.find_optimal_path("Foundation", "Machine Learning")
    
    if route:
        print("\n--- OPTIMAL CAREER PATH ---")
        print(" -> ".join(route['path_nodes']))
        print(f"Total Traversal Cost: {route['total_heuristic_cost']}")
        for step in route['steps']:
            print(f"- Learn {step['to_node']} via [{step['course']}]")
            
    engine.close()
