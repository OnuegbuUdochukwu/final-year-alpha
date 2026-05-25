import os
import logging
import psycopg2
from dotenv import load_dotenv

# Load environment variables (from project root if run from data-pipeline directory)
load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Initial batch of 100+ standard tech industry job roles
TECH_ROLES = [
    "Frontend Developer", "Backend Developer", "Full Stack Developer", "Mobile App Developer",
    "iOS Developer", "Android Developer", "Software Engineer", "Systems Engineer",
    "Data Scientist", "Data Analyst", "Data Engineer", "Machine Learning Engineer",
    "AI Engineer", "Deep Learning Engineer", "Computer Vision Engineer", "NLP Engineer",
    "DevOps Engineer", "Site Reliability Engineer (SRE)", "Cloud Architect", "Cloud Engineer",
    "Database Administrator", "Database Developer", "Network Engineer", "Network Administrator",
    "Cybersecurity Analyst", "Information Security Engineer", "Penetration Tester", "Security Consultant",
    "Systems Administrator", "IT Support Specialist", "Help Desk Technician", "IT Manager",
    "Product Manager", "Project Manager", "Scrum Master", "Agile Coach",
    "UI/UX Designer", "UX Researcher", "Web Designer", "Graphic Designer",
    "QA Engineer", "Automation Tester", "Manual Tester", "SDET (Software Development Engineer in Test)",
    "Game Developer", "Blockchain Developer", "Smart Contract Developer", "Web3 Developer",
    "Embedded Systems Engineer", "IoT Engineer", "Hardware Engineer", "Firmware Engineer",
    "Data Architect", "Enterprise Architect", "Solutions Architect", "Technical Architect",
    "Business Analyst", "Systems Analyst", "Technical Writer", "Developer Advocate",
    "Release Manager", "Build Engineer", "Platform Engineer", "Infrastructure Engineer",
    "Site Manager", "CTO (Chief Technology Officer)", "CIO (Chief Information Officer)", "VP of Engineering",
    "Engineering Manager", "Technical Lead", "Software Architect", "Principal Engineer",
    "Big Data Engineer", "Business Intelligence Analyst", "BI Developer", "ETL Developer",
    "Salesforce Developer", "SAP Consultant", "ERP Specialist", "CRM Developer",
    "SharePoint Developer", "ServiceNow Developer", "Mulesoft Developer", "Integration Specialist",
    "Ruby on Rails Developer", "Python Developer", "Java Developer", "C++ Developer",
    "C# Developer", ".NET Developer", "PHP Developer", "Node.js Developer",
    "React Developer", "Angular Developer", "Vue.js Developer", "Svelte Developer",
    "Flutter Developer", "React Native Developer", "Swift Developer", "Kotlin Developer",
    "Go Developer", "Rust Developer", "Scala Developer", "Elixir Developer"
]

def ensure_roles_table(cur):
    """Idempotently creates the roles table."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id SERIAL PRIMARY KEY,
            role_name VARCHAR(255) UNIQUE NOT NULL
        );
    """)

def seed_roles_table():
    """Seeds the roles table with the defined tech roles."""
    pg_url = os.environ.get("SUPABASE_PG_URL")
    if not pg_url:
        logger.error("SUPABASE_PG_URL environment variable is missing.")
        return

    logger.info("Connecting to Supabase PostgreSQL database...")
    try:
        conn = psycopg2.connect(pg_url)
        cur = conn.cursor()
        
        # Ensure table exists
        ensure_roles_table(cur)
        
        logger.info(f"Seeding {len(TECH_ROLES)} roles...")
        inserted_count = 0
        skipped_count = 0
        
        for role in TECH_ROLES:
            try:
                cur.execute(
                    "INSERT INTO roles (role_name) VALUES (%s) ON CONFLICT (role_name) DO NOTHING RETURNING id;",
                    (role,)
                )
                if cur.fetchone():
                    inserted_count += 1
                else:
                    skipped_count += 1
            except Exception as row_error:
                logger.error(f"Error inserting role '{role}': {row_error}")
                conn.rollback() # Rollback the failed transaction block
                continue
                
        conn.commit()
        logger.info(f"Role seeding completed. Inserted: {inserted_count}, Skipped (already existed): {skipped_count}")
        
    except Exception as e:
        logger.error(f"Database error during seeding: {e}")
    finally:
        if 'cur' in locals() and cur:
            cur.close()
        if 'conn' in locals() and conn:
            conn.close()
            logger.info("Database connection closed.")

if __name__ == "__main__":
    seed_roles_table()
