import os
import logging
from neo4j import GraphDatabase
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class Neo4jConfigurator:
    """Sets up constraints and indexes in the Neo4j Graph Database."""
    
    def __init__(self):
        load_dotenv()
        # We mapped neo4j to localhost:7687 in docker-compose
        self.uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.user = os.getenv("NEO4J_USER", "neo4j")
        self.password = os.getenv("NEO4J_PASSWORD", "IloveAdeogomitide")
        
        logger.info(f"Connecting to Neo4j at {self.uri}...")
        self.driver = GraphDatabase.driver(self.uri, auth=(self.user, self.password))

    def close(self):
        self.driver.close()

    def apply_schema(self):
        """Creates uniqueness constraints on the canonical nodes."""
        constraints = [
            "CREATE CONSTRAINT unique_skill_id IF NOT EXISTS FOR (s:Skill) REQUIRE s.id IS UNIQUE",
            "CREATE CONSTRAINT unique_role_name IF NOT EXISTS FOR (r:Role) REQUIRE r.name IS UNIQUE",
            "CREATE CONSTRAINT unique_resource_id IF NOT EXISTS FOR (res:Resource) REQUIRE res.id IS UNIQUE"
        ]
        
        indexes = [
            "CREATE INDEX skill_name_index IF NOT EXISTS FOR (s:Skill) ON (s.name)",
        ]

        with self.driver.session() as session:
            for query in constraints:
                logger.info(f"Applying constraint: {query}")
                session.run(query)
                
            for query in indexes:
                logger.info(f"Applying index: {query}")
                session.run(query)
                
        logger.info("Neo4j Schema applied successfully.")

    def verify_connection(self):
        """Simple ping to ensure Neo4j is ready to rock."""
        try:
            self.driver.verify_connectivity()
            logger.info("Neo4j connectivity verified!")
            return True
        except Exception as e:
            logger.error(f"Failed to connect to Neo4j: {e}")
            return False

if __name__ == "__main__":
    db = Neo4jConfigurator()
    if db.verify_connection():
        db.apply_schema()
    db.close()
