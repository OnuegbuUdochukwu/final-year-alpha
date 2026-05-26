import logging
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
import uvicorn
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
import os
import httpx
import re
import json
import psycopg2
from dotenv import load_dotenv
load_dotenv()

HF_TOKEN = os.getenv("HF_TOKEN", "")
_HF_ROADMAP_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"
_HF_FALLBACK_MODEL = "meta-llama/Meta-Llama-3-8B-Instruct"
_HF_API_BASE = "https://api-inference.huggingface.co/v1/chat/completions"

# Import our custom mathematical engine
from pathfinder import PathfinderGraphEngine
from path_optimizer import PathOptimizer

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Global engine instance to share the in-memory NetworkX graph across requests
engine = None
optimizer = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for the FastAPI app."""
    global engine, optimizer

    logger.info("--- Active FastAPI Routes ---")
    for route in app.routes:
        logger.info(f"Active Route: {route.path} [{getattr(route, 'name', '')}]")
    logger.info("---------------------------")

    logger.info("Initializing the Pathfinder Engine...")
    engine = PathfinderGraphEngine()
    optimizer = PathOptimizer()

    # Pre-load the Neo4j graph into memory (NetworkX) on boot for high-speed calculation
    try:
        engine.build_networkx_graph()
        logger.info("Engine successfully loaded Neo4j data into memory.")
    except Exception as e:
        logger.error(f"Failed to build graph: {str(e)}")
        # We don't crash the server here so health checks can still pass

    yield  # App runs and handles requests

    # Shutdown
    logger.info("Shutting down the Pathfinder Engine...")
    if engine:
        engine.close()

app = FastAPI(
    title="Pathfinder Graph Service",
    description="Calculates optimal career paths using A* and semantic BERT embeddings, optimized by Linear Programming.",
    version="1.0.0",
    lifespan=lifespan
)

# Expose Prometheus metrics at /metrics
Instrumentator().instrument(app).expose(app)

# ─── Response Models ──────────────────────────────────────────────────────────
class Step(BaseModel):
    from_node: str
    to_node: str
    course: str
    weight: float
    cost: Optional[float] = 0.0
    hours: Optional[float] = 0.0

class PathResponse(BaseModel):
    start_skill: str
    target_skill: str
    total_heuristic_cost: float
    path_nodes: List[str]
    steps: List[Step]


# ─── Helper: PostgreSQL connection ────────────────────────────────────────────
def _get_pg_conn():
    """Returns an open psycopg2 connection or raises HTTP 503."""
    pg_url = os.getenv("SUPABASE_PG_URL", "")
    if not pg_url:
        raise HTTPException(status_code=503, detail="Database not configured.")
    return psycopg2.connect(pg_url)

def _ensure_user_skills_table(cur):
    """Idempotently creates the user_skills table if it does not exist."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS user_skills (
            id          SERIAL PRIMARY KEY,
            user_id     TEXT NOT NULL,
            skill_name  TEXT NOT NULL,
            completed_at TIMESTAMPTZ DEFAULT NOW(),
            UNIQUE(user_id, skill_name)
        );
    """)

def _ensure_roles_table(cur):
    """Idempotently creates the roles table if it does not exist."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id          BIGSERIAL PRIMARY KEY,
            role_name   TEXT NOT NULL UNIQUE,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
    """)

def _ensure_roadmap_cache_table(cur):
    """Idempotently creates the roadmap_cache table."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS roadmap_cache (
            id                SERIAL PRIMARY KEY,
            role_name         TEXT NOT NULL UNIQUE,
            json_data         JSONB NOT NULL,
            created_at        TIMESTAMPTZ DEFAULT NOW(),
            generation_date   TIMESTAMPTZ DEFAULT NOW(),
            user_contributed  BOOLEAN DEFAULT FALSE
        );
    """)
    # Ensure columns exist if table was already created
    cur.execute("ALTER TABLE roadmap_cache ADD COLUMN IF NOT EXISTS generation_date TIMESTAMPTZ DEFAULT NOW();")
    cur.execute("ALTER TABLE roadmap_cache ADD COLUMN IF NOT EXISTS user_contributed BOOLEAN DEFAULT FALSE;")


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Validates the API is awake."""
    return {"status": "active", "engine_loaded": (engine is not None and engine.G.number_of_nodes() > 0)}


@app.get("/debug-neo4j")
async def debug_neo4j():
    """Temporary diagnostic endpoint – shows which env vars are loaded and tests connectivity."""
    uri = os.getenv("NEO4J_URI", "<NOT SET>")
    user = os.getenv("NEO4J_USERNAME", "<NOT SET>")
    db = os.getenv("NEO4J_DATABASE", "<NOT SET>")
    pw_set = "YES" if os.getenv("NEO4J_PASSWORD") else "NO"

    connectivity = "untested"
    if engine:
        try:
            engine.neo_driver.verify_connectivity()
            connectivity = "OK"
        except Exception as e:
            connectivity = f"FAILED: {str(e)}"

    return {
        "NEO4J_URI": uri,
        "NEO4J_USERNAME": user,
        "NEO4J_DATABASE": db,
        "NEO4J_PASSWORD_SET": pw_set,
        "connectivity": connectivity,
        "graph_nodes": engine.G.number_of_nodes() if engine else 0
    }

@app.get("/skills/canonical")
async def get_canonical_skills():
    """Returns a list of all canonical skill names from the memory graph for NLP normalization."""
    if engine is None:
        raise HTTPException(status_code=503, detail="Graph Engine not initialized.")
    skills = [data.get("name") for _, data in engine.G.nodes(data=True) if data.get("name")]
    return list(set(skills))

# ─── Dynamic Role Search (Restored) ───────────────────────────────────────────
@app.get("/search")
async def search_roles(query: str = ""):
    """
    Search the roles table. Returns [] on failure to prevent frontend crash.
    """
    logger.info("New route definition: /search active")
    try:
        query = query.strip()
        conn = _get_pg_conn()
        cur = conn.cursor()
        
        _ensure_roles_table(cur)
        conn.commit()
        
        if not query or len(query) < 2:
            cur.execute("SELECT id, role_name FROM roles ORDER BY role_name LIMIT 10;")
        else:
            cur.execute(
                "SELECT id, role_name FROM roles WHERE role_name ILIKE %s LIMIT 10;",
                (f"%{query}%",)
            )
            
        rows = cur.fetchall()
        cur.close()
        conn.close()
        
        return [{"id": str(row[0]), "name": row[1]} for row in rows]
    except Exception as e:
        logger.error(f"[RoleSearch] Error in /search route: {str(e)}")
        return []




# ─── Roadmap Generation ───────────────────────────────────────────────────────
@app.get("/generate")
async def generate_roadmap(target_role: str = Query(..., description="The target role to fetch the roadmap for (e.g., 'frontend')")):
    """
    Retrieves the pre-built roadmap from Neo4j based on the requested target_role.
    Returns the graph structured for React Flow.
    """
    if engine is None:
        raise HTTPException(status_code=503, detail="Graph Engine is not currently initialized. Check Neo4j connection.")

    try:
        with engine.neo_driver.session(database=engine.neo4j_database) as session:
            # Fetch nodes
            nodes_result = session.run(
                "MATCH (n:Skill {role: $role}) RETURN n.id AS id, n.name AS label",
                role=target_role
            )
            raw_nodes = [record for record in nodes_result]

            if not raw_nodes:
                raise HTTPException(status_code=404, detail=f"No roadmap found for role '{target_role}'.")

            # Fetch edges
            edges_result = session.run(
                "MATCH (s:Skill {role: $role})-[:REQUIRES]->(t:Skill {role: $role}) RETURN s.id AS source, t.id AS target",
                role=target_role
            )
            raw_edges = [record for record in edges_result]

        # Format for React Flow
        react_flow_nodes = [
            {"id": row["id"], "data": {"label": row["label"]}, "position": {"x": 0, "y": 0}}
            for row in raw_nodes
        ]

        react_flow_edges = [
            {"id": f"e-{row['source']}-{row['target']}", "source": row["source"], "target": row["target"]}
            for row in raw_edges
        ]

        return {
            "nodes": react_flow_nodes,
            "edges": react_flow_edges
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to fetch roadmap from Neo4j: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal server error while fetching roadmap.")


@app.get("/generate-roadmap")
async def generate_roadmap_jit(
    target_role: str = Query(..., description="The target role to generate the roadmap for"),
    skills: Optional[str] = Query("", description="Comma-separated list of user's current skills")
):
    """
    Just-In-Time Roadmap Generator.
    Cache-first system: checks Supabase roadmap_cache, if missing calls LLM, saves to cache, returns JSON.
    """
    # 1. Cache Check
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        _ensure_roadmap_cache_table(cur)
        conn.commit()

        cur.execute("SELECT json_data FROM roadmap_cache WHERE role_name = %s", (target_role,))
        row = cur.fetchone()
        
        if row:
            cur.close()
            conn.close()
            logger.info(f"[JIT] Cache hit for role '{target_role}'")
            return row[0]
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"[JIT] DB read error: {str(e)}")
        # Don't fail completely yet, try to generate it anyway

    # 2. LLM Generation
    logger.info(f"[JIT] Cache miss for '{target_role}'. Calling LLM...")
    if not HF_TOKEN:
        raise HTTPException(status_code=500, detail="HF_TOKEN not configured. Cannot generate JIT roadmap.")

    import re
    import json
    from shared.llm_service import query_llm
    
    system_prompt = (
        'You are an expert career architect. '
        f'The user is a professional with these existing skills: [{skills}]. '
        f'They want to become a {target_role}. '
        'Create an optimized learning path of 10-15 milestones. '
        'Output valid JSON only. Schema: '
        '{ "milestones": [{ "title": string, "description": string, "skills": [string], "resource": string, "project": string }] }.'
    )

    try:
        raw_text = query_llm(
            system_prompt=system_prompt,
            user_prompt=f"Generate the milestone learning path for {target_role}.",
            max_tokens=1500,
            temperature=0.2
        )
        
        # Extract JSON
        cleaned = re.sub(r'```(?:json)?', '', raw_text, flags=re.IGNORECASE).strip()
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in LLM response")
        
        milestones_json = json.loads(match.group(0))
        if "milestones" not in milestones_json:
            raise ValueError("JSON missing 'milestones' array")

    except Exception as e:
        logger.error(f"[JIT] LLM generation failed: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to generate roadmap from AI provider.")

    # 3. Persistence
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        
        cur.execute(
            """
            INSERT INTO roadmap_cache (role_name, json_data, user_contributed)
            VALUES (%s, %s, TRUE)
            ON CONFLICT (role_name) DO UPDATE
            SET json_data = EXCLUDED.json_data,
                generation_date = NOW(),
                user_contributed = TRUE
            """,
            (target_role, json.dumps(milestones_json))
        )
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"[JIT] Successfully generated and cached roadmap for '{target_role}'")
    except Exception as e:
        logger.error(f"[JIT] DB write error: {str(e)}")
        # Still return the generated json even if cache write fails
        pass

    return milestones_json


ROLE_TO_SKILL_MAP = {
    "Backend Developer": "Backend Mastery",
    "Frontend Developer": "Frontend Mastery",
    "Data Scientist": "Data Science Mastery",
    "Machine Learning Engineer": "Machine Learning",
    "Full Stack Developer": "Full Stack Mastery",
    "DevOps Engineer": "DevOps Mastery",
    "Cloud Architect": "Cloud Architecture",
}

# ─── Pathfinding ──────────────────────────────────────────────────────────────
@app.get("/find-path", response_model=PathResponse)
async def get_optimal_path(
    target: str = Query(..., description="The name of the target skill to reach (e.g., 'Machine Learning')"),
    start: Optional[str] = Query("Foundation", description="The starting skill node (default: 'Foundation')"),
    max_budget: Optional[float] = Query(None, description="Maximum total cost in dollars"),
    max_hours: Optional[float] = Query(None, description="Maximum total time in hours"),
    known_skills: Optional[str] = Query("", description="Comma-separated list of user's normalized skills")
):
    """
    Executes the A* pathfinding algorithm to find the optimal connected route,
    filters out mastered skills via Cypher Gap Analysis, 
    then uses Linear Programming to prune the path to fit inside budget/time constraints.
    """
    if engine is None or engine.G.number_of_nodes() == 0:
        raise HTTPException(status_code=503, detail="Graph Engine is not currently initialized. Check Neo4j connection.")

    logger.info(f"API Request: Find path from '{start}' to '{target}' (Budget: {max_budget}, Hours: {max_hours})")

    # 1. Role-to-Skill Mapping
    mapped_target = ROLE_TO_SKILL_MAP.get(target, target)
    
    # 2. Normalization via LLM
    from shared.llm_service import query_llm
    canonical_skills = [data.get("name") for _, data in engine.G.nodes(data=True) if data.get("name")]
    if mapped_target not in canonical_skills:
        logger.info(f"Normalizing '{mapped_target}' via LLM...")
        try:
            prompt = f"Match this skill name '{mapped_target}' to exactly one from this list: {canonical_skills}. Return ONLY the exact match string, nothing else. If none match, return 'UNKNOWN'."
            normalized = query_llm(user_prompt=prompt, system_prompt="You are an exact string matcher.", max_tokens=50).strip()
            if normalized in canonical_skills:
                mapped_target = normalized
        except Exception as e:
            logger.error(f"Failed to normalize target: {e}")

    try:
        # 3. Get raw A* path
        route = engine.find_optimal_path(start, mapped_target)

        if route is None:
            raise HTTPException(
                status_code=404,
                detail=f"No viable path found from '{start}' to '{target}'."
            )

        raw_steps = route["steps"]
        # Apply default fallbacks for cost/hours if the Neo4j edge is missing them
        for step in raw_steps:
            if 'cost' not in step:
                step['cost'] = 50.0
            if 'hours' not in step:
                step['hours'] = 10.0

        # 4. Gap Analysis Filtering
        user_skills_list = [s.strip() for s in known_skills.split(',') if s.strip()] if known_skills else []
        if user_skills_list:
            gaps = engine.get_gap_analysis(mapped_target, user_skills_list)
            missing_skill_names = {gap["skill_name"] for gap in gaps}
            missing_skill_names.add(mapped_target) # Ensure target is always considered a valid destination
            
            filtered_steps = []
            for step in raw_steps:
                if step["to_node"] in missing_skill_names:
                    filtered_steps.append(step)
                else:
                    logger.info(f"Gap Analysis: Bypassing mastered skill '{step['to_node']}'.")
            raw_steps = filtered_steps

        # 3. Optimize the path with Linear Programming
        optimized_steps = optimizer.optimize_path(raw_steps, max_budget=max_budget, max_hours=max_hours)

        # Recalculate node path and total cost based on optimized steps
        final_nodes: List[str] = []
        if optimized_steps:
            final_nodes.append(optimized_steps[0]['from_node'])
            for s in optimized_steps:
                final_nodes.append(s['to_node'])

        final_weight = sum(s['weight'] for s in optimized_steps)

        return PathResponse(
            start_skill=start,
            target_skill=target,
            total_heuristic_cost=round(final_weight, 4),
            path_nodes=final_nodes,
            steps=optimized_steps
        )

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Engine computation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal algorithmic error during path calculation.")


# ─── Completion Webhook (Phase 6.3.1) ─────────────────────────────────────────
class CompleteStepRequest(BaseModel):
    user_id: str
    skill_name: str

@app.post("/complete-step")
async def complete_step(body: CompleteStepRequest):
    """
    Webhook that marks a learning milestone as complete.
    Upserts a record into the `user_skills` PostgreSQL table so the
    backend knows the user's skill vector has grown.
    """
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        _ensure_user_skills_table(cur)
        cur.execute("""
            INSERT INTO user_skills (user_id, skill_name)
            VALUES (%s, %s)
            ON CONFLICT (user_id, skill_name) DO UPDATE
                SET completed_at = NOW();
        """, (body.user_id, body.skill_name))
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Skill '{body.skill_name}' marked complete for user '{body.user_id}'.")
        return {"status": "ok", "user_id": body.user_id, "skill_completed": body.skill_name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Webhook DB error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to record skill completion.")


# ─── Current Skills (Phase 6.3.2 – state restore) ────────────────────────────
class CompletedSkill(BaseModel):
    skill_name: str
    completed_at: str

@app.get("/skills/{user_id}", response_model=Dict[str, List[CompletedSkill]])
async def get_user_skills(user_id: str):
    """
    Returns the list of skills a user has already completed.
    Used by the frontend to restore state on page refresh and to determine
    the correct start node for dynamic path recalculation.
    """
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        _ensure_user_skills_table(cur)
        cur.execute("""
            SELECT skill_name, completed_at::text
            FROM user_skills
            WHERE user_id = %s
            ORDER BY completed_at DESC;
        """, (user_id,))
        rows = cur.fetchall()
        cur.close()
        conn.close()

        skills = [{"skill_name": row[0], "completed_at": row[1]} for row in rows]
        logger.info(f"Retrieved {len(skills)} completed skills for user '{user_id}'.")
        return {"user_id": user_id, "completed_skills": skills}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Skills fetch error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user skills.")


if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8001))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False)
