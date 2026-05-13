import os
import time
import logging
import httpx
import psycopg2
import jwt
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from prometheus_fastapi_instrumentator import Instrumentator

load_dotenv()

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# ─── Configuration ────────────────────────────────────────────────────────────
JWT_SECRET = os.getenv("JWT_SECRET", "changeme-supersecret-key")
JWT_ALGORITHM = "HS256"
JWT_EXPIRY_SECONDS = 3600  # 1 hour

_raw_nlp = os.getenv("NLP_SERVICE_URL", "http://localhost:8000")
NLP_SERVICE_URL = f"http://{_raw_nlp}" if not _raw_nlp.startswith("http") else _raw_nlp

_raw_graph = os.getenv("GRAPH_SERVICE_URL", "http://localhost:8001")
GRAPH_SERVICE_URL = f"http://{_raw_graph}" if not _raw_graph.startswith("http") else _raw_graph

# Supabase PostgreSQL connection string for user state management
SUPABASE_PG_URL = os.getenv("SUPABASE_PG_URL", "")

# Demo credentials (replace with DB lookup in production)
DEMO_USERS = {
    "admin": "password123",
    "student": "fyp2024"
}

app = FastAPI(
    title="AI Career Pathfinder – API Gateway",
    description="JWT-secured gateway that proxies requests to NLP and Graph microservices.",
    version="1.0.0"
)

# ─── CORS ────────────────────────────────────────────────────────────────────
# On Render, the frontend URL will change. We use an environment variable
# ALLOWED_ORIGINS (comma-separated) to handle this.
raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:5173,http://127.0.0.1:5173")
origins = [o.strip() for o in raw_origins.split(",")]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# ─── PostgreSQL Helpers (user state) ─────────────────────────────────────────
def _get_pg_conn():
    """Returns an open psycopg2 connection or raises HTTP 503."""
    if not SUPABASE_PG_URL:
        raise HTTPException(status_code=503, detail="Database not configured (SUPABASE_PG_URL missing).")
    return psycopg2.connect(SUPABASE_PG_URL)

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

# Expose Prometheus metrics at /metrics
Instrumentator().instrument(app).expose(app)

# ─── Models ───────────────────────────────────────────────────────────────────
class LoginRequest(BaseModel):
    username: str
    password: str

class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = JWT_EXPIRY_SECONDS

# ─── Auth helpers ─────────────────────────────────────────────────────────────
def create_token(username: str) -> str:
    payload = {
        "sub": username,
        "iat": int(time.time()),
        "exp": int(time.time()) + JWT_EXPIRY_SECONDS
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=JWT_ALGORITHM)

def verify_token(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    if not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or malformed Authorization header.")
    token = auth_header.removeprefix("Bearer ")
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[JWT_ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token has expired.")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token.")

# ─── Public Endpoints ─────────────────────────────────────────────────────────
@app.get("/health")
def health():
    return {"status": "ok", "service": "api-gateway"}

@app.post("/login", response_model=TokenResponse)
def login(body: LoginRequest):
    """
    Authenticate with username + password.
    Returns a signed JWT to use in all subsequent /api/* requests.
    """
    stored_password = DEMO_USERS.get(body.username)
    if not stored_password or stored_password != body.password:
        raise HTTPException(status_code=401, detail="Invalid username or password.")
    token = create_token(body.username)
    logger.info(f"User '{body.username}' logged in successfully.")
    return TokenResponse(access_token=token)

# ─── Protected Proxy Endpoints ────────────────────────────────────────────────
@app.post("/api/parse-resume")
async def proxy_parse_resume(request: Request, _user=Depends(verify_token)):
    """Proxy: POST /api/parse-resume → nlp-service:8000/parse-resume"""
    body = await request.body()
    headers = {k: v for k, v in request.headers.items() if k.lower() != "host"}
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(
                f"{NLP_SERVICE_URL}/parse-resume",
                content=body,
                headers=headers
            )
        try:
            resp_data = resp.json()
        except ValueError:
            resp_data = {"detail": f"NLP Service returned non-JSON: {resp.text[:100]}"}
        return JSONResponse(status_code=resp.status_code, content=resp_data)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Bad Gateway: Could not reach NLP Service. {str(e)}")

@app.get("/api/find-path")
async def proxy_find_path(request: Request, _user=Depends(verify_token)):
    """Proxy: GET /api/find-path?... → graph-service:8001/find-path"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{GRAPH_SERVICE_URL}/find-path",
                params=dict(request.query_params)
            )
        try:
            content = resp.json()
        except ValueError:
            content = {"detail": f"Graph Service returned non-JSON (HTTP {resp.status_code}): {resp.text[:200]}"}
        return JSONResponse(status_code=resp.status_code, content=content)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Bad Gateway: Could not reach Graph Service. {str(e)}")

@app.post("/api/complete-step")
async def handle_complete_step(request: Request, user=Depends(verify_token)):
    """
    Marks a learning milestone as complete by upserting directly into
    the Supabase PostgreSQL `user_skills` table.

    Phase 6.3.2: the user_id is extracted from the verified JWT `sub` claim
    so the client never has to supply it manually.
    """
    body = await request.json()

    # Extract user identity from the JWT — prevents spoofing.
    user_id = user.get("sub", body.get("user_id", "anonymous"))
    skill_name = body.get("skill_name", "")

    if not skill_name:
        raise HTTPException(status_code=400, detail="Missing required field: skill_name")

    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        _ensure_user_skills_table(cur)
        cur.execute("""
            INSERT INTO user_skills (user_id, skill_name)
            VALUES (%s, %s)
            ON CONFLICT (user_id, skill_name) DO UPDATE
                SET completed_at = NOW();
        """, (user_id, skill_name))
        conn.commit()
        cur.close()
        conn.close()
        logger.info(f"Skill '{skill_name}' marked complete for user '{user_id}'.")
        return {"status": "ok", "user_id": user_id, "skill_completed": skill_name}
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"DB error recording skill completion: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to record skill completion.")

@app.get("/api/current-skills/{user_id}")
async def get_current_skills(user_id: str, request: Request, user=Depends(verify_token)):
    """
    Returns the list of skills already marked complete for a given user
    by querying the Supabase PostgreSQL `user_skills` table directly.

    Only the user themselves (JWT sub == user_id) or admin can query this.
    """
    jwt_user = user.get("sub", "")
    if jwt_user != user_id and jwt_user != "admin":
        raise HTTPException(status_code=403, detail="Access denied.")

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
        logger.error(f"DB error fetching user skills: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to retrieve user skills.")

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
