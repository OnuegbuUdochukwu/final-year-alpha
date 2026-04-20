import logging
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
import uvicorn
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator
import os
import psycopg2
from dotenv import load_dotenv
load_dotenv()

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


# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health_check():
    """Validates the API is awake."""
    return {"status": "active", "engine_loaded": (engine is not None and engine.G.number_of_nodes() > 0)}


# ─── Pathfinding ──────────────────────────────────────────────────────────────
@app.get("/find-path", response_model=PathResponse)
async def get_optimal_path(
    target: str = Query(..., description="The name of the target skill to reach (e.g., 'Machine Learning')"),
    start: Optional[str] = Query("Foundation", description="The starting skill node (default: 'Foundation')"),
    max_budget: Optional[float] = Query(None, description="Maximum total cost in dollars"),
    max_hours: Optional[float] = Query(None, description="Maximum total time in hours")
):
    """
    Executes the A* pathfinding algorithm to find the optimal connected route,
    then uses Linear Programming to prune the path to fit inside budget/time constraints.
    """
    if engine is None or engine.G.number_of_nodes() == 0:
        raise HTTPException(status_code=503, detail="Graph Engine is not currently initialized. Check Neo4j connection.")

    logger.info(f"API Request: Find path from '{start}' to '{target}' (Budget: {max_budget}, Hours: {max_hours})")

    try:
        # 1. Get raw A* path
        route = engine.find_optimal_path(start, target)

        if route is None:
            raise HTTPException(
                status_code=404,
                detail=f"No viable path found from '{start}' to '{target}'. Check node names and graph connections."
            )

        raw_steps = route["steps"]
        # Apply default fallbacks for cost/hours if the Neo4j edge is missing them
        for step in raw_steps:
            if 'cost' not in step:
                step['cost'] = 50.0
            if 'hours' not in step:
                step['hours'] = 10.0

        # 2. Optimize the path with Linear Programming
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
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)
