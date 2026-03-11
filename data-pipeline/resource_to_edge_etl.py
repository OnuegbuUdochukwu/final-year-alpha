import os
import logging
import psycopg2
from neo4j import GraphDatabase
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class ResourceEdgeMapper:
    """Connects learning resources into Neo4j edges between Skill nodes."""
    
    def __init__(self):
        load_dotenv()
        self.pg_url = os.getenv("SUPABASE_PG_URL")
        self.neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD", "IloveAdeogomitide")

        if not self.pg_url:
            raise ValueError("SUPABASE_PG_URL missing from .env")

        self.neo_driver = GraphDatabase.driver(self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password))

    def close(self):
        self.neo_driver.close()

    def fetch_resources(self):
        """Extract all resources and their prerequisites from PostgreSQL."""
        logger.info("Extracting Learning Resources from PostgreSQL...")
        conn = psycopg2.connect(self.pg_url)
        cursor = conn.cursor()
        # Using COALESCE to handle beginner courses without strict prerequisites
        cursor.execute("""
            SELECT resource_id, title, cost_usd, duration_hours, primary_skill_id, COALESCE(prerequisite_skill_id, 0)
            FROM learning_resources 
            WHERE primary_skill_id IS NOT NULL;
        """)
        resources = cursor.fetchall()
        cursor.close()
        conn.close()
        logger.info(f"Extracted {len(resources)} learning resources.")
        return resources

    def create_foundation_node(self):
        """Ensures a generic Foundation Node exists for beginner tracks."""
        query = "MERGE (f:Skill {id: '0'}) SET f.name = 'Foundation', f.category = 'General'"
        with self.neo_driver.session() as session:
            session.run(query)

    def load_edges_to_neo4j(self, resources):
        """Map resources to :LEARN_VIA edges in the Graph."""
        logger.info("Mapping Resources to Edges in Neo4j...")
        self.create_foundation_node()

        query = """
        UNWIND $resources AS res
        MATCH (source:Skill {id: toString(res.prerequisite_skill_id)})
        MATCH (target:Skill {id: toString(res.primary_skill_id)})
        MERGE (source)-[e:LEARN_VIA {resource_id: res.resource_id}]->(target)
        SET e.title = res.title,
            e.cost = res.cost_usd,
            e.time = res.duration_hours
        """
        
        formatted_resources = [
            {
                "resource_id": str(r[0]), 
                "title": r[1], 
                "cost_usd": float(r[2]), 
                "duration_hours": r[3],
                "primary_skill_id": str(r[4]),
                "prerequisite_skill_id": str(r[5])
            }
            for r in resources
        ]

        with self.neo_driver.session() as session:
            result = session.run(query, resources=formatted_resources)
            summary = result.consume()
            logger.info(f"Successfully mapped {summary.counters.relationships_created} new edges in Graph.")

    def run_mapper(self):
        """Execute the Edge ETL."""
        resources = self.fetch_resources()
        if resources:
            self.load_edges_to_neo4j(resources)

if __name__ == "__main__":
    mapper = ResourceEdgeMapper()
    mapper.run_mapper()
    mapper.close()
    logger.info("Resource-to-Edge ETL Pipeline Complete.")
