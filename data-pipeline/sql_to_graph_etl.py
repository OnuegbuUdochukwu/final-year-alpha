import os
import logging
import psycopg2
from neo4j import GraphDatabase
from dotenv import load_dotenv

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class GraphETLService:
    """Extracts relational data from PostgreSQL and Loads it as Nodes in Neo4j."""
    
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

    def fetch_skills(self):
        """Extract all skills from PostgreSQL."""
        logger.info("Extracting Skills from PostgreSQL...")
        conn = psycopg2.connect(self.pg_url)
        cursor = conn.cursor()
        # Ensure we strictly select from the serial ID and canonical name
        cursor.execute("SELECT skill_id, canonical_name, category, demand_weight FROM skills;")
        skills = cursor.fetchall()
        cursor.close()
        conn.close()
        logger.info(f"Extracted {len(skills)} skills.")
        return skills

    def fetch_roles(self):
        """Extract all structured roles from PostgreSQL."""
        logger.info("Extracting Roles from PostgreSQL...")
        conn = psycopg2.connect(self.pg_url)
        cursor = conn.cursor()
        # The true schema is: role_id, role_name, cluster_id, required_skills_json
        cursor.execute("SELECT role_id, role_name, 'Technology' as industry FROM job_roles;")
        roles = cursor.fetchall()
        cursor.close()
        conn.close()
        logger.info(f"Extracted {len(roles)} roles.")
        return roles

    def load_skills_to_neo4j(self, skills):
        """Load PostgreSQL skills into Neo4j as (Skill) Nodes."""
        logger.info("Loading Skills into Neo4j...")
        query = """
        UNWIND $skills AS skill
        MERGE (s:Skill {id: skill.id})
        SET s.name = skill.name, 
            s.category = skill.category, 
            s.demand_weight = skill.demand_weight
        """
        
        # Format the data for Cypher UNWIND
        formatted_skills = [
            {"id": str(s[0]), "name": s[1], "category": s[2], "demand_weight": float(s[3]) if s[3] else 0.0}
            for s in skills
        ]

        with self.neo_driver.session() as session:
            session.run(query, skills=formatted_skills)
            
        logger.info("Successfully loaded Skill nodes into Graph.")

    def load_roles_to_neo4j(self, roles):
        """Load PostgreSQL roles into Neo4j as (Role) Nodes."""
        logger.info("Loading Roles into Neo4j...")
        query = """
        UNWIND $roles AS role
        MERGE (r:Role {id: role.id})
        SET r.name = role.title, 
            r.industry = role.industry
        """
        
        formatted_roles = [
            {"id": str(r[0]), "title": r[1], "industry": r[2]}
            for r in roles
        ]

        with self.neo_driver.session() as session:
            session.run(query, roles=formatted_roles)
            
        logger.info("Successfully loaded Role nodes into Graph.")

    def run_etl(self):
        """Execute the full Extact-Transform-Load pipeline."""
        skills = self.fetch_skills()
        if skills:
            self.load_skills_to_neo4j(skills)
            
        roles = self.fetch_roles()
        if roles:
            self.load_roles_to_neo4j(roles)

if __name__ == "__main__":
    etl = GraphETLService()
    etl.run_etl()
    etl.close()
    logger.info("SQL-to-Graph ETL Pipeline Complete.")
