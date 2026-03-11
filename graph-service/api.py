import logging
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
from typing import List, Dict, Optional
import uvicorn
from contextlib import asynccontextmanager

# Import our custom mathematical engine
from pathfinder import PathfinderGraphEngine

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Global engine instance to share the in-memory NetworkX graph across requests
engine = None

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for the FastAPI app."""
    global engine
    
    logger.info("Initializing the Pathfinder Engine...")
    engine = PathfinderGraphEngine()
    
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
    description="Calculates optimal career paths using A* and semantic BERT embeddings.",
    version="1.0.0",
    lifespan=lifespan
)

# --- Response Models ---
class Step(BaseModel):
    from_node: str
    to_node: str
    course: str
    weight: float

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
    start: Optional[str] = Query("Foundation", description="The starting skill node (default: 'Foundation')")
):
    """
    Executes the A* pathfinding algorithm to find the optimal connected route 
    between two skills based on Hyperparameter W edges and Cosine Similarity node heuristics.
    """
    if engine is None or engine.G.number_of_nodes() == 0:
        raise HTTPException(status_code=503, detail="Graph Engine is not currently initialized. Check Neo4j connection.")
        
    logger.info(f"API Request: Find path from '{start}' to '{target}'")
    
    try:
        route = engine.find_optimal_path(start, target)
        
        if route is None:
            raise HTTPException(status_code=404, detail=f"No viable path found from '{start}' to '{target}'. Check node names and graph connections.")
            
        return PathResponse(
            start_skill=start,
            target_skill=target,
            total_heuristic_cost=route["total_heuristic_cost"],
            path_nodes=route["path_nodes"],
            steps=route["steps"]
        )
        
    except Exception as e:
        logger.error(f"Engine computation error: {str(e)}")
        raise HTTPException(status_code=500, detail="Internal algorithmic error during path calculation.")

if __name__ == "__main__":
    uvicorn.run("api:app", host="0.0.0.0", port=8001, reload=True)
