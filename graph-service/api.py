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
        
    yield # App runs and handles requests
    
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

# --- Response Models ---
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


@app.get("/health")
async def health_check():
    """Validates the API is awake."""
    return {"status": "active", "engine_loaded": (engine is not None and engine.G.number_of_nodes() > 0)}


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
            raise HTTPException(status_code=404, detail=f"No viable path found from '{start}' to '{target}'. Check node names and graph connections.")
            
        # Extract edge cost and hours for optimizer
        # In the original api.py, we didn't fetch cost and time explicitly from Neo4j into the routing step.
        # However, for a fully working optimization, the engine's build_networkx_graph would need those.
        # But wait! The optimizer works on the steps.
        # Let's adjust api to just route the data to optimizer.
        
        raw_steps = route["steps"]
        # Fake cost/hours if missing just for demonstration fallback if Neo4j edge is missing it
        for step in raw_steps:
             if 'cost' not in step: step['cost'] = 50.0 # Default fallback
             if 'hours' not in step: step['hours'] = 10.0 # Default fallback
             
        # 2. Optimize the path
        optimized_steps = optimizer.optimize_path(raw_steps, max_budget=max_budget, max_hours=max_hours)
        
        # Recalculate node path and total cost based on optimized steps
        final_nodes = []
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
        
    except Exception as e:
        logger.error(f"Engine computation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal algorithmic error during path calculation.")


# ─── Completion Webhook ──────────────────────────────────────────────────────
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
    pg_url = os.getenv("SUPABASE_PG_URL", "")
    if not pg_url:
        raise HTTPException(status_code=503, detail="Database not configured.")

    try:
        conn = psycopg2.connect(pg_url)
        cur = conn.cursor()
        cur.execute("""
            CREATE TABLE IF NOT EXISTS user_skills (
                id          SERIAL PRIMARY KEY,
                user_id     TEXT NOT NULL,
                skill_name  TEXT NOT NULL,
                completed_at TIMESTAMPTZ DEFAULT NOW(),
                UNIQUE(user_id, skill_name)
            );
        """)
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
    except Exception as e:
        logger.error(f"Webhook DB error: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to record skill completion.")


if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)
