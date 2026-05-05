"""
Neo4j Seed Script – Populates the AuraDB instance with Skill nodes and LEARN_VIA edges.

Usage:
    python seed_neo4j.py          # reads from .env
    NEO4J_URI=... python seed_neo4j.py   # or pass env vars directly

The script is IDEMPOTENT: it uses MERGE so running it multiple times is safe.
"""

import os
import logging
import numpy as np
from neo4j import GraphDatabase
from dotenv import load_dotenv

# Optional: generate real BERT embeddings if sentence-transformers is installed
try:
    from sentence_transformers import SentenceTransformer
    EMBEDDER = SentenceTransformer("all-MiniLM-L6-v2")
    USE_REAL_EMBEDDINGS = True
except ImportError:
    EMBEDDER = None
    USE_REAL_EMBEDDINGS = False

load_dotenv()

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

# ─── Skill Definitions ────────────────────────────────────────────────────────
# Each skill has a name and an optional description used for embedding generation
SKILLS = [
    "Foundation",
    "Programming Basics",
    "Python",
    "JavaScript",
    "HTML & CSS",
    "Data Structures",
    "Algorithms",
    "Databases",
    "SQL",
    "NoSQL",
    "Git & Version Control",
    "REST APIs",
    "Web Development",
    "React",
    "Node.js",
    "FastAPI",
    "Docker",
    "Cloud Computing",
    "AWS",
    "Linux",
    "Data Analysis",
    "Statistics",
    "Machine Learning",
    "Deep Learning",
    "Natural Language Processing",
    "Computer Vision",
    "DevOps",
    "CI/CD",
    "System Design",
    "Backend Engineer",
    "Frontend Engineer",
    "Full-Stack Engineer",
    "Data Scientist",
    "ML Engineer",
    "DevOps Engineer",
    "Cloud Architect",
]

# ─── Learning Paths (Edges) ──────────────────────────────────────────────────
# (from_skill, to_skill, course_title, weight, cost, hours)
EDGES = [
    # Foundation → Basics
    ("Foundation", "Programming Basics", "CS50 – Intro to Computer Science", 0.10, 0, 40),
    ("Foundation", "HTML & CSS", "freeCodeCamp – Responsive Web Design", 0.12, 0, 20),
    ("Foundation", "Git & Version Control", "Git & GitHub Crash Course", 0.08, 0, 5),

    # Basics → Languages
    ("Programming Basics", "Python", "Python for Everybody (Coursera)", 0.15, 0, 30),
    ("Programming Basics", "JavaScript", "The Odin Project – JS Foundations", 0.15, 0, 30),

    # Core CS
    ("Python", "Data Structures", "Data Structures in Python (Udemy)", 0.20, 15, 25),
    ("JavaScript", "Data Structures", "JavaScript Algorithms & DS (freeCodeCamp)", 0.20, 0, 30),
    ("Data Structures", "Algorithms", "Algorithms Specialization (Stanford)", 0.25, 50, 40),

    # Databases
    ("Programming Basics", "Databases", "Database Management Essentials", 0.12, 0, 15),
    ("Databases", "SQL", "PostgreSQL Bootcamp (Udemy)", 0.15, 12, 20),
    ("Databases", "NoSQL", "MongoDB University M001", 0.15, 0, 15),

    # Web Development track
    ("HTML & CSS", "Web Development", "The Web Developer Bootcamp", 0.18, 15, 50),
    ("JavaScript", "React", "React – The Complete Guide (Udemy)", 0.22, 15, 40),
    ("JavaScript", "Node.js", "Node.js – The Complete Guide (Udemy)", 0.22, 15, 35),
    ("Python", "FastAPI", "FastAPI Full Course (freeCodeCamp)", 0.18, 0, 15),
    ("Python", "REST APIs", "REST API Design (Coursera)", 0.15, 30, 10),
    ("Node.js", "REST APIs", "Building REST APIs with Express", 0.15, 0, 12),

    # DevOps track
    ("Linux", "Docker", "Docker Mastery (Udemy)", 0.20, 15, 20),
    ("Git & Version Control", "Linux", "Linux Command Line Basics", 0.12, 0, 10),
    ("Docker", "CI/CD", "GitHub Actions CI/CD Pipeline", 0.18, 0, 10),
    ("Docker", "Cloud Computing", "Cloud Computing Concepts (Coursera)", 0.20, 0, 20),
    ("Cloud Computing", "AWS", "AWS Certified Cloud Practitioner", 0.22, 30, 40),

    # Data Science track
    ("Python", "Data Analysis", "Data Analysis with Pandas (Kaggle)", 0.18, 0, 15),
    ("Data Analysis", "Statistics", "Statistics with Python (Coursera)", 0.20, 50, 25),
    ("Statistics", "Machine Learning", "Machine Learning (Andrew Ng)", 0.28, 0, 60),
    ("Machine Learning", "Deep Learning", "Deep Learning Specialization", 0.30, 50, 80),
    ("Deep Learning", "Natural Language Processing", "NLP Specialization (Coursera)", 0.30, 50, 60),
    ("Deep Learning", "Computer Vision", "CS231n – Convolutional Neural Networks", 0.30, 0, 50),

    # System Design
    ("Algorithms", "System Design", "Designing Data-Intensive Applications", 0.25, 40, 30),
    ("REST APIs", "System Design", "System Design Interview Course", 0.22, 30, 20),

    # Career destinations
    ("FastAPI", "Backend Engineer", "Backend Career Path (roadmap.sh)", 0.15, 0, 10),
    ("Node.js", "Backend Engineer", "Backend Career Path (roadmap.sh)", 0.15, 0, 10),
    ("SQL", "Backend Engineer", "Backend with Databases", 0.12, 0, 8),
    ("System Design", "Backend Engineer", "Senior Backend Preparation", 0.18, 0, 15),

    ("React", "Frontend Engineer", "Frontend Career Path (roadmap.sh)", 0.15, 0, 10),
    ("HTML & CSS", "Frontend Engineer", "Advanced CSS & Sass", 0.12, 10, 15),

    ("React", "Full-Stack Engineer", "Full-Stack Open (Helsinki)", 0.20, 0, 60),
    ("Node.js", "Full-Stack Engineer", "Full-Stack Open (Helsinki)", 0.20, 0, 60),
    ("FastAPI", "Full-Stack Engineer", "Full-Stack Python + React", 0.20, 20, 40),

    ("Machine Learning", "Data Scientist", "Applied Data Science (IBM)", 0.20, 40, 40),
    ("Statistics", "Data Scientist", "Data Science Professional Certificate", 0.18, 40, 50),

    ("Deep Learning", "ML Engineer", "ML Engineering for Production (MLOps)", 0.22, 0, 40),
    ("Machine Learning", "ML Engineer", "ML Engineering Zoomcamp", 0.20, 0, 50),

    ("CI/CD", "DevOps Engineer", "DevOps Career Path (roadmap.sh)", 0.15, 0, 10),
    ("Docker", "DevOps Engineer", "Kubernetes for Beginners", 0.20, 0, 20),
    ("AWS", "DevOps Engineer", "AWS DevOps Professional", 0.22, 30, 40),

    ("AWS", "Cloud Architect", "AWS Solutions Architect Associate", 0.25, 30, 50),
    ("System Design", "Cloud Architect", "Cloud Architecture Patterns", 0.22, 20, 25),
]


def generate_embeddings(skill_names: list) -> dict:
    """Generate BERT embeddings for each skill name."""
    if USE_REAL_EMBEDDINGS:
        logger.info(f"Generating real BERT embeddings for {len(skill_names)} skills...")
        vectors = EMBEDDER.encode(skill_names)
        return {name: vectors[i].tolist() for i, name in enumerate(skill_names)}
    else:
        logger.warning("sentence-transformers not installed – using random placeholder embeddings.")
        return {name: np.random.randn(384).tolist() for name in skill_names}


def seed(uri: str, user: str, password: str, database: str):
    """Connect to Neo4j and seed the graph."""
    driver = GraphDatabase.driver(uri, auth=(user, password))

    # Test connectivity
    driver.verify_connectivity()
    logger.info("Connected to Neo4j successfully.")

    embeddings = generate_embeddings(SKILLS)

    with driver.session(database=database) as session:
        # 1. Create unique constraint (idempotent)
        logger.info("Creating constraint on Skill.name...")
        session.run("CREATE CONSTRAINT skill_name_unique IF NOT EXISTS FOR (s:Skill) REQUIRE s.name IS UNIQUE")

        # 2. Create Skill nodes
        logger.info(f"Seeding {len(SKILLS)} Skill nodes...")
        for skill_name in SKILLS:
            session.run(
                """
                MERGE (s:Skill {name: $name})
                SET s.embedding = $embedding
                """,
                name=skill_name,
                embedding=embeddings[skill_name]
            )

        # 3. Create LEARN_VIA edges
        logger.info(f"Seeding {len(EDGES)} LEARN_VIA relationships...")
        for (from_s, to_s, title, weight, cost, hours) in EDGES:
            session.run(
                """
                MATCH (a:Skill {name: $from_skill})
                MATCH (b:Skill {name: $to_skill})
                MERGE (a)-[r:LEARN_VIA {title: $title}]->(b)
                SET r.normalized_weight = $weight,
                    r.cost = $cost,
                    r.hours = $hours
                """,
                from_skill=from_s,
                to_skill=to_s,
                title=title,
                weight=weight,
                cost=cost,
                hours=hours
            )

        # 4. Verify
        result = session.run("MATCH (n:Skill) RETURN count(n) as nodes")
        node_count = result.single()["nodes"]
        result2 = session.run("MATCH ()-[r:LEARN_VIA]->() RETURN count(r) as edges")
        edge_count = result2.single()["edges"]
        logger.info(f"✅ Seed complete: {node_count} nodes, {edge_count} edges.")

    driver.close()


if __name__ == "__main__":
    neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
    neo4j_user = os.getenv("NEO4J_USERNAME", "neo4j")
    neo4j_password = os.getenv("NEO4J_PASSWORD", "password")
    neo4j_database = os.getenv("NEO4J_DATABASE", "neo4j")

    logger.info(f"Seeding Neo4j at {neo4j_uri} (user={neo4j_user}, db={neo4j_database})")
    seed(neo4j_uri, neo4j_user, neo4j_password, neo4j_database)
