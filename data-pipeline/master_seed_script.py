import os
import sys
import json
import re
import logging
import psycopg2
from neo4j import GraphDatabase
from dotenv import load_dotenv

# Add parent directory to path to import shared module
sys.path.append(os.path.join(os.path.dirname(__file__), ".."))

from shared.llm_service import query_llm
from role_indexer import TECH_ROLES

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))
load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Constants for Graph parsing
_WEIGHT_CEILING = 300.0

GRAPH_SYSTEM_PROMPT = """You are a curriculum design API. Your ONLY output is a single valid JSON object.
Do NOT output markdown, code fences, explanations, or any text outside the JSON object.

Generate a learning path subgraph for the given target job role.

Rules:
1. Include 5-10 intermediate Skill nodes between "Foundation" and the target role.
2. Every node must have exactly three fields:
   - "id": unique snake_case identifier (e.g. "html_css")
   - "name": human-readable label (e.g. "HTML & CSS")
   - "type": one of "Concept", "Language", "Tool", or "Role"
3. Every edge must have exactly five fields:
   - "source_id": id of the source node
   - "target_id": id of the target node
   - "title": name of a real online course or resource
   - "time_hours": estimated study time in hours (integer)
   - "cost_usd": cost in USD (integer, 0 if free)
4. The FIRST edge MUST have source_id exactly "foundation" (lowercase).
5. The LAST edge MUST have target_id matching the role node's id.
6. Every node (except Foundation) must appear as target_id in at least one edge.
7. Do NOT include a "weight" field — the system calculates this automatically.

Return ONLY the JSON object. No other text."""

def _ensure_roadmap_cache_table(cur):
    """Idempotently creates the roadmap_cache table."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS roadmap_cache (
            id SERIAL PRIMARY KEY,
            role_name TEXT NOT NULL UNIQUE,
            json_data JSONB NOT NULL,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)

def extract_json(raw_text: str) -> dict:
    """Extracts JSON from an LLM string."""
    cleaned = re.sub(r'```(?:json)?', '', raw_text, flags=re.IGNORECASE).strip()
    match = re.search(r'\{.*\}', cleaned, re.DOTALL)
    if not match:
        raise ValueError("No JSON object found in LLM response")
    return json.loads(match.group(0))

def generate_roadmap_json(role: str) -> dict:
    """Generates the high-level roadmap JSON via the LLM service."""
    system_prompt = (
        'You are an expert career architect. '
        f'The user is a professional with no existing skills. '
        f'They want to become a {role}. '
        'Create an optimized learning path of 10-15 milestones. '
        'Output valid JSON only. Schema: '
        '{ "milestones": [{ "title": string, "description": string, "skills": [string], "resource": string, "project": string }] }.'
    )
    raw_response = query_llm(
        system_prompt=system_prompt,
        user_prompt=f"Generate the milestone learning path for {role}.",
        max_tokens=1500,
        temperature=0.2
    )
    
    data = extract_json(raw_response)
    if "milestones" not in data:
        raise ValueError("JSON missing 'milestones' array")
    return data

def generate_deep_graph(role: str) -> dict:
    """Generates the granular skill dependencies (deep graph) via the LLM service."""
    raw_response = query_llm(
        system_prompt=GRAPH_SYSTEM_PROMPT,
        user_prompt=f'Generate a learning path subgraph for the role: "{role}"',
        max_tokens=1500,
        temperature=0.1
    )
    
    subgraph = extract_json(raw_response)
    if "nodes" not in subgraph or "edges" not in subgraph:
        raise ValueError("JSON missing 'nodes' or 'edges' keys")
    subgraph.setdefault("role", role)
    return subgraph

def inject_into_neo4j(subgraph: dict, neo_driver) -> None:
    """Writes all nodes and edges from the LLM subgraph into Neo4j."""
    database = os.getenv("NEO4J_DATABASE", "neo4j")
    role = subgraph.get("role")
    
    with neo_driver.session(database=database) as session:
        # 1. Upsert Skill nodes
        for node in subgraph.get("nodes", []):
            name = node.get("name", "").strip()
            node_type = node.get("type", "Concept")
            if not name:
                continue
            session.run(
                """
                MERGE (s:Skill {name: $name})
                SET s.node_type = $node_type,
                    s.jit = true
                """,
                name=name,
                node_type=node_type,
            )

        # Build id→name lookup for edge resolution
        id_to_name = {n["id"]: n["name"].strip() for n in subgraph.get("nodes", [])}
        id_to_name["foundation"] = "Foundation"

        # 2. Upsert REQUIRES edges
        for edge in subgraph.get("edges", []):
            src_name = id_to_name.get(edge.get("source_id", ""), "")
            tgt_name = id_to_name.get(edge.get("target_id", ""), "")
            title = edge.get("title", "Online Course").strip()
            time_h = int(edge.get("time_hours", 10))
            cost_usd = int(edge.get("cost_usd", 0))

            if not src_name or not tgt_name:
                continue

            weight = round(time_h / _WEIGHT_CEILING, 4)
            
            session.run(
                """
                MERGE (a:Skill {name: $src})
                MERGE (b:Skill {name: $tgt})
                MERGE (a)-[r:REQUIRES {title: $title}]->(b)
                SET r.normalized_weight = $weight,
                    r.cost = $cost,
                    r.hours = $hours
                """,
                src=src_name,
                tgt=tgt_name,
                title=title,
                weight=weight,
                cost=cost_usd,
                hours=time_h,
            )

def main():
    pg_url = os.environ.get("SUPABASE_PG_URL")
    neo4j_uri = os.environ.get("NEO4J_URI")
    neo4j_user = os.environ.get("NEO4J_USERNAME")
    neo4j_password = os.environ.get("NEO4J_PASSWORD")

    if not all([pg_url, neo4j_uri, neo4j_user, neo4j_password]):
        logger.error("Missing required database environment variables.")
        return

    # Check for limit arg
    limit = None
    if len(sys.argv) > 1:
        limit = int(sys.argv[1])
        roles_to_seed = TECH_ROLES[:limit]
        logger.info(f"Running master seed script for the first {limit} roles.")
    else:
        roles_to_seed = TECH_ROLES
        logger.info(f"Running master seed script for ALL {len(roles_to_seed)} roles.")

    # Connect to databases
    try:
        conn = psycopg2.connect(pg_url)
        neo_driver = GraphDatabase.driver(neo4j_uri, auth=(neo4j_user, neo4j_password))
    except Exception as e:
        logger.error(f"Failed to connect to databases: {e}")
        return

    try:
        cur = conn.cursor()
        _ensure_roadmap_cache_table(cur)
        conn.commit()

        for role in roles_to_seed:
            logger.info(f"Processing role: {role}")
            
            # Idempotency Check
            cur.execute("SELECT id FROM roadmap_cache WHERE role_name = %s", (role,))
            if cur.fetchone():
                logger.info(f"Role '{role}' already present in Supabase roadmap_cache, skipping...")
                continue
            
            logger.info(f"[{role}] Generating milestone JSON (high-level roadmap)...")
            try:
                roadmap_json = generate_roadmap_json(role)
            except Exception as e:
                logger.error(f"Failed to generate roadmap JSON for {role}: {e}")
                continue
                
            logger.info(f"[{role}] Generating granular skill dependencies (deep graph)...")
            try:
                deep_graph_json = generate_deep_graph(role)
            except Exception as e:
                logger.error(f"Failed to generate deep graph for {role}: {e}")
                continue
                
            # Dual-Store Write
            logger.info(f"[{role}] Inserting JSON roadmap into Supabase `roadmap_cache`...")
            try:
                cur.execute(
                    """
                    INSERT INTO roadmap_cache (role_name, json_data)
                    VALUES (%s, %s)
                    ON CONFLICT (role_name) DO UPDATE
                    SET json_data = EXCLUDED.json_data
                    """,
                    (role, json.dumps(roadmap_json))
                )
                conn.commit()
            except Exception as e:
                logger.error(f"Failed to write to Supabase for {role}: {e}")
                conn.rollback()
                continue
                
            logger.info(f"[{role}] Injecting deep graph nodes and REQUIRES relationships into Neo4j...")
            try:
                inject_into_neo4j(deep_graph_json, neo_driver)
            except Exception as e:
                logger.error(f"Failed to inject graph to Neo4j for {role}: {e}")
                continue
                
            logger.info(f"[{role}] Successfully seeded!")

    finally:
        if 'cur' in locals(): cur.close()
        if 'conn' in locals(): conn.close()
        if 'neo_driver' in locals(): neo_driver.close()
        logger.info("Database connections closed.")

if __name__ == "__main__":
    main()
