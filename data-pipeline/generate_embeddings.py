import os
import logging
from neo4j import GraphDatabase
from dotenv import load_dotenv
from sentence_transformers import SentenceTransformer

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class EmbeddingGenerator:
    """Generates BERT embeddings for Skill and Role nodes in Neo4j."""

    def __init__(self):
        load_dotenv()
        self.neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD", "password")
        
        self.neo_driver = GraphDatabase.driver(self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password))
        
        logger.info("Loading SentenceTransformer model 'all-MiniLM-L6-v2'...")
        self.model = SentenceTransformer('all-MiniLM-L6-v2')

    def close(self):
        self.neo_driver.close()

    def process_and_update_nodes(self):
        """Fetches all nodes, generates embeddings, and updates them in Neo4j."""
        
        with self.neo_driver.session() as session:
            # 1. Fetch Skills
            logger.info("Fetching Skill nodes...")
            skill_result = session.run("MATCH (s:Skill) RETURN elementId(s) AS id, s.name AS name")
            skills = [{"id": r["id"], "text": r["name"]} for r in skill_result]
            
            # 2. Fetch Roles
            logger.info("Fetching Role nodes...")
            role_result = session.run("MATCH (r:Role) RETURN elementId(r) AS id, r.name AS name")
            roles = [{"id": r["id"], "text": r["name"]} for r in role_result]
            
            nodes = skills + roles
            if not nodes:
                logger.warning("No nodes found to process.")
                return

            # Filter out Foundation if present, or just embed it
            texts = [n["text"] for n in nodes]
            ids = [n["id"] for n in nodes]

            logger.info(f"Generating embeddings for {len(nodes)} nodes...")
            embeddings = self.model.encode(texts)

            logger.info("Uploading embeddings to Neo4j...")
            update_query = """
            UNWIND $updates AS update
            MATCH (n) WHERE elementId(n) = update.id
            SET n.embedding = update.embedding
            """
            
            updates = []
            for node_id, embedding in zip(ids, embeddings):
                updates.append({
                    "id": node_id,
                    "embedding": embedding.tolist()
                })

            session.run(update_query, updates=updates)
            logger.info(f"Successfully updated embeddings for {len(updates)} nodes.")

if __name__ == "__main__":
    generator = EmbeddingGenerator()
    generator.process_and_update_nodes()
    generator.close()
