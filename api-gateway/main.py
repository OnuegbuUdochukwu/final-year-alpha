import os
import time
import html
import logging
import asyncio
import httpx
import psycopg2
import re
import json
import jwt
from datetime import datetime, timezone
from collections import defaultdict
from pathlib import Path
from typing import List, Optional
from fastapi import FastAPI, HTTPException, Request, Depends
from fastapi.responses import JSONResponse, HTMLResponse, StreamingResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from prometheus_fastapi_instrumentator import Instrumentator
from jinja2 import Environment, FileSystemLoader, select_autoescape
from weasyprint import HTML as WeasyprintHTML

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

# Resume rate limiter config (max requests per minute per user)
RESUME_RATE_LIMIT = int(os.getenv("RESUME_RATE_LIMIT_PER_MIN", "5"))
_rate_limit_store: dict = defaultdict(list)  # {user_id: [timestamps]}

# Hugging Face Inference API config (reused from graph-service pattern)
HF_TOKEN = os.getenv("HF_TOKEN", "")
_HF_ROLE_VALIDATION_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"
_HF_ROLE_FALLBACK_MODEL = "mistralai/Mistral-7B-Instruct-v0.3"
_HF_API_BASE = "https://api-inference.huggingface.co/v1/chat/completions"

# Jinja2 template environment — loads from api-gateway/templates/
_TEMPLATES_DIR = Path(__file__).parent / "templates"
_jinja_env = Environment(
    loader=FileSystemLoader(str(_TEMPLATES_DIR)),
    autoescape=select_autoescape(["html"])  # auto-escapes {{ variables }}
)

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
    """Idempotently creates the roles table and seeds it with baseline roles."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS roles (
            id          BIGSERIAL PRIMARY KEY,
            role_name   TEXT NOT NULL UNIQUE,
            created_at  TIMESTAMPTZ DEFAULT NOW()
        );
    """)
    # Seed baseline roles (ON CONFLICT DO NOTHING keeps it idempotent)
    _SEED_ROLES = [
        'Frontend Developer', 'Backend Developer', 'DevOps Engineer',
        'Full-Stack Developer', 'Data Analyst', 'Cyber Security Specialist',
        'Android Developer',
    ]
    for role in _SEED_ROLES:
        cur.execute(
            "INSERT INTO roles (role_name) VALUES (%s) ON CONFLICT (role_name) DO NOTHING;",
            (role,)
        )

def _ensure_milestone_feedback_table(cur):
    """Idempotently creates the milestone_feedback table."""
    cur.execute("""
        CREATE TABLE IF NOT EXISTS milestone_feedback (
            id SERIAL PRIMARY KEY,
            role_name TEXT NOT NULL,
            milestone_title TEXT NOT NULL,
            user_id TEXT NOT NULL,
            comment TEXT,
            created_at TIMESTAMPTZ DEFAULT NOW()
        );
    """)


def _ensure_users_biography_column(cur):
    """
    Idempotently adds the biography_json column to the users table.
    Uses ALTER TABLE ... ADD COLUMN IF NOT EXISTS so it is safe to run on
    every startup against an existing production database.
    """
    cur.execute("""
        ALTER TABLE users
        ADD COLUMN IF NOT EXISTS biography_json JSONB DEFAULT '{}'::jsonb;
    """)


def _validate_role_with_llm(query: str) -> str | None:
    """
    Calls the HuggingFace Inference API to verify if the query is a valid
    software industry job role. Returns the standardized role name or None.
    """
    if not HF_TOKEN:
        logger.warning("[RoleSearch] HF_TOKEN not set — skipping LLM validation.")
        return None

    system_prompt = (
        'You are a job role validation API. Your ONLY output is a single valid JSON object.\n'
        'Given a query, determine if it is a valid software/technology industry job role.\n'
        'If it IS a valid role, return: {"role": "Standardized Role Name"}\n'
        'If it is NOT a valid role, return: {"role": null}\n'
        'Return ONLY the JSON object. No other text, no markdown, no explanation.'
    )
    user_message = f'Is "{query}" a valid software/technology industry job role?'

    try:
        from shared.llm_service import query_llm_standard
        
        prompt = f"<|system|>\n{system_prompt}</s>\n<|user|>\n{user_message}</s>\n<|assistant|>\n"
        
        raw_text = query_llm_standard(
            prompt=prompt,
            model="HuggingFaceH4/zephyr-7b-beta",
            max_new_tokens=100
        )
        logger.info(f"[RoleSearch] LLM raw response: {raw_text[:200]}")

        # Extract JSON from response (handles markdown fences)
        cleaned = re.sub(r'```(?:json)?', '', raw_text, flags=re.IGNORECASE).strip()
        match = re.search(r'\{.*\}', cleaned, re.DOTALL)
        if not match:
            return None

        result = json.loads(match.group(0))
        role_name = result.get("role")
        if role_name and isinstance(role_name, str) and role_name.lower() != "null":
            return role_name.strip()
        return None

    except Exception as e:
        logger.error(f"[RoleSearch] LLM validation error: {str(e)}")
        return None

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
            
            # --- 2. Intercept and Save to Supabase (saves skills + biography) ---
            if resp.status_code == 200:
                import json
                user_id = _user.get("sub", "anonymous")
                try:
                    conn = _get_pg_conn()
                    cur = conn.cursor()
                    email = _user.get("email", f"{user_id}@placeholder.com")

                    # Ensure the biography_json column exists before writing to it
                    _ensure_users_biography_column(cur)

                    # Extract the biography chunk returned by the NLP service
                    biography_data = resp_data.get("biography", {})

                    cur.execute("""
                        INSERT INTO users (firebase_uid, email, current_skills_json, biography_json)
                        VALUES (%s, %s, %s, %s)
                        ON CONFLICT (firebase_uid) DO UPDATE 
                        SET current_skills_json = EXCLUDED.current_skills_json,
                            biography_json = EXCLUDED.biography_json;
                    """, (user_id, email, json.dumps(resp_data), json.dumps(biography_data)))
                    conn.commit()
                    cur.close()
                    conn.close()
                    logger.info(
                        f"Upserted skills + biography_json for user {user_id}. "
                        f"Biography keys with content: "
                        f"{[k for k, v in biography_data.items() if v]}"
                    )
                except Exception as e:
                    logger.error(f"ERROR: Failed to save resume data to Supabase: {e}")
                    # Continue anyway to not break the UI
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

@app.get("/api/generate")
async def proxy_generate_roadmap(request: Request, _user=Depends(verify_token)):
    """Proxy: GET /api/generate?target_role=... → graph-service:8001/generate"""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            resp = await client.get(
                f"{GRAPH_SERVICE_URL}/generate",
                params=dict(request.query_params)
            )
        try:
            content = resp.json()
        except ValueError:
            content = {"detail": f"Graph Service returned non-JSON (HTTP {resp.status_code}): {resp.text[:200]}"}
        return JSONResponse(status_code=resp.status_code, content=content)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Bad Gateway: Could not reach Graph Service. {str(e)}")

@app.get("/api/generate-roadmap")
async def proxy_generate_roadmap_jit(request: Request, _user=Depends(verify_token)):
    """Proxy: GET /api/generate-roadmap?... → graph-service:8001/generate-roadmap"""
    try:
        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.get(
                f"{GRAPH_SERVICE_URL}/generate-roadmap",
                params=dict(request.query_params)
            )
        try:
            content = resp.json()
        except ValueError:
            content = {"detail": f"Graph Service returned non-JSON (HTTP {resp.status_code}): {resp.text[:200]}"}
        return JSONResponse(status_code=resp.status_code, content=content)
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Bad Gateway: Could not reach Graph Service. {str(e)}")

class FlagMilestoneRequest(BaseModel):
    role_name: str
    milestone_title: str
    comment: Optional[str] = ""

@app.post("/api/feedback/flag-milestone")
async def flag_milestone(payload: FlagMilestoneRequest, request: Request, user=Depends(verify_token)):
    """Stores user feedback indicating a generated milestone is irrelevant."""
    user_id = user.get("sub", "anonymous")
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        _ensure_milestone_feedback_table(cur)
        
        cur.execute(
            """
            INSERT INTO milestone_feedback (role_name, milestone_title, user_id, comment)
            VALUES (%s, %s, %s, %s)
            """,
            (payload.role_name, payload.milestone_title, user_id, payload.comment)
        )
        conn.commit()
        cur.close()
        conn.close()
        return {"status": "success", "message": "Feedback recorded."}
    except Exception as e:
        logger.error(f"Failed to record milestone feedback: {str(e)}")
        raise HTTPException(status_code=500, detail="Failed to record feedback.")

@app.get("/api/health")
async def health_check():
    """Aggregate health check for deployment readiness."""
    health_status = {
        "status": "ok",
        "supabase": "unknown",
        "neo4j_proxy": "unknown",
        "llm": "unknown"
    }
    
    # Check Supabase
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        cur.execute("SELECT 1")
        cur.fetchone()
        cur.close()
        conn.close()
        health_status["supabase"] = "ok"
    except Exception as e:
        health_status["supabase"] = f"error: {str(e)}"
        health_status["status"] = "degraded"

    # Check Graph Service / Neo4j Proxy
    try:
        async with httpx.AsyncClient(timeout=5.0) as client:
            resp = await client.get(f"{GRAPH_SERVICE_URL}/skills/canonical")
            if resp.status_code == 200:
                health_status["neo4j_proxy"] = "ok"
            else:
                health_status["neo4j_proxy"] = f"error: HTTP {resp.status_code}"
                health_status["status"] = "degraded"
    except Exception as e:
        health_status["neo4j_proxy"] = f"error: {str(e)}"
        health_status["status"] = "degraded"
        
    # Check LLM Connection (HuggingFace token present)
    if HF_TOKEN:
        health_status["llm"] = "configured"
    else:
        health_status["llm"] = "missing_token"
        health_status["status"] = "degraded"

    return health_status

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

@app.get("/api/user/profile")
async def get_user_profile(request: Request, user=Depends(verify_token)):
    """
    Returns the user's profile, including the persistent baseline_resume_data.
    """
    user_id = user.get("sub", "anonymous")
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        cur.execute("""
            SELECT current_skills_json
            FROM users
            WHERE firebase_uid = %s;
        """, (user_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        # If user row exists and has data, return it
        resume_data = row[0] if row else {}
        return {"user_id": user_id, "current_skills_json": resume_data}
    except Exception as e:
        logger.error(f"DB error fetching user profile: {str(e)}")
        # If the table doesn't exist yet in a fresh environment, fail gracefully
        return {"user_id": user_id, "current_skills_json": {}}


@app.get("/api/user/biography")
async def get_user_biography(request: Request, user=Depends(verify_token)):
    """
    Returns the deterministically chunked biographical data for the authenticated
    user: { summary, education, experience }.

    This is fetched by ResumeBuilder on mount to pre-populate the
    Professional Summary and Education fields with data extracted from
    the user's uploaded CV rather than hardcoded placeholder text.
    """
    user_id = user.get("sub", "anonymous")
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()

        # Ensure the column exists (no-op if already present)
        _ensure_users_biography_column(cur)
        conn.commit()

        cur.execute("""
            SELECT biography_json
            FROM users
            WHERE firebase_uid = %s;
        """, (user_id,))
        row = cur.fetchone()
        cur.close()
        conn.close()

        biography = row[0] if (row and row[0]) else {}
        return {
            "user_id": user_id,
            "name": biography.get("name", ""),
            "email": biography.get("email", ""),
            "phone": biography.get("phone", ""),
            "location": biography.get("location", ""),
            "title": biography.get("title", ""),
            "summary": biography.get("summary", ""),
            "education": biography.get("education", []),
            "experience": biography.get("experience", []),
        }
    except Exception as e:
        logger.error(f"DB error fetching biography for user '{user_id}': {str(e)}")
        # Fail gracefully — the frontend falls back to placeholder defaults
        return {
            "user_id": user_id,
            "name": "",
            "email": "",
            "phone": "",
            "location": "",
            "title": "",
            "summary": "",
            "education": [],
            "experience": [],
        }

# ─── Dynamic Role Search ─────────────────────────────────────────────────────
@app.get("/api/search-roles")
async def search_roles(query: str = "", _user=Depends(verify_token)):
    """
    Dynamic Role Search Hub (Crash-Proof).

    1. Searches the Supabase `roles` table (ILIKE fuzzy match).
    2. If no results, calls the HuggingFace LLM to validate the query as a job role.
    3. If the LLM validates it, inserts it into `roles` for future lookups.
    4. Always returns a consistent JSON array: [{"id": ..., "name": ...}]
    5. On ANY failure (DB, network, LLM), returns {"roles": []} with 200 OK
       so the frontend dropdown never sees a 500.
    """
    try:
        query = query.strip()
        if not query or len(query) < 2:
            # Return all roles when query is too short
            try:
                conn = _get_pg_conn()
                cur = conn.cursor()
                _ensure_roles_table(cur)
                conn.commit()
                cur.execute("SELECT id, role_name FROM roles ORDER BY role_name LIMIT 100;")
                rows = cur.fetchall()
                cur.close()
                conn.close()
                return [{"id": str(row[0]), "name": row[1]} for row in rows]
            except Exception as e:
                logger.error(f"[RoleSearch] DB error on short query: {str(e)}")
                return {"roles": []}

        conn = _get_pg_conn()
        cur = conn.cursor()
        _ensure_roles_table(cur)
        conn.commit()

        # Step 1: Search Supabase
        cur.execute(
            "SELECT id, role_name FROM roles WHERE role_name ILIKE %s LIMIT 100;",
            (f"%{query}%",)
        )
        rows = cur.fetchall()

        if rows:
            cur.close()
            conn.close()
            logger.info(f"[RoleSearch] Found {len(rows)} DB matches for '{query}'.")
            return [{"id": str(row[0]), "name": row[1]} for row in rows]

        # Step 2: No DB results — try LLM fallback
        logger.info(f"[RoleSearch] No DB matches for '{query}'. Trying LLM validation...")
        validated_name = _validate_role_with_llm(query)

        if not validated_name:
            cur.close()
            conn.close()
            logger.info(f"[RoleSearch] LLM rejected '{query}' as invalid role.")
            return []

        # Step 3: LLM validated — register the new role
        logger.info(f"[RoleSearch] LLM validated '{query}' → '{validated_name}'. Registering...")
        cur.execute(
            "INSERT INTO roles (role_name) VALUES (%s) ON CONFLICT (role_name) DO NOTHING RETURNING id, role_name;",
            (validated_name,)
        )
        new_row = cur.fetchone()
        conn.commit()

        if new_row:
            result = [{"id": str(new_row[0]), "name": new_row[1]}]
        else:
            # ON CONFLICT — role was inserted by a concurrent request; fetch it
            cur.execute("SELECT id, role_name FROM roles WHERE role_name = %s;", (validated_name,))
            existing = cur.fetchone()
            result = [{"id": str(existing[0]), "name": existing[1]}] if existing else []

        cur.close()
        conn.close()
        return result

    except Exception as e:
        logger.error(f"[RoleSearch] Crash-proof fallback triggered: {str(e)}")
        return {"roles": []}

# ─── Resume Feature ──────────────────────────────────────────────────────────

# ── Pydantic models ──────────────────────────────────────────────────────────
class CourseItem(BaseModel):
    name: str
    provider: Optional[str] = ""

class ResumePayload(BaseModel):
    """Unified request body for both /preview and /generate."""
    name:            Optional[str]            = "Professional"
    title:           Optional[str]            = "Career Changer"
    email:           Optional[str]            = ""
    linkedin:        Optional[str]            = ""
    location:        Optional[str]            = ""
    # User-edited biography text forwarded from the canvas
    summary:         Optional[str]            = ""
    education:       Optional[str]            = ""
    cv_skills:       Optional[List[str]]      = []
    gained_skills:   Optional[List[str]]      = []
    user_additions:  Optional[List[str]]      = []
    user_removals:   Optional[List[str]]      = []
    order:           Optional[List[str]]      = []
    target_role:     Optional[str]            = ""
    courses:         Optional[List[CourseItem]] = []


# ── Helpers ───────────────────────────────────────────────────────────────────
def _sanitise(value: str) -> str:
    """HTML-escape a user-supplied string to prevent XSS in the Jinja2 template."""
    return html.escape(str(value).strip())


def _check_rate_limit(user_id: str):
    """Raises HTTP 429 if the user has exceeded RESUME_RATE_LIMIT calls/minute."""
    now = time.time()
    window_start = now - 60
    calls = _rate_limit_store[user_id]
    # Prune timestamps outside the rolling 1-minute window
    _rate_limit_store[user_id] = [t for t in calls if t > window_start]
    if len(_rate_limit_store[user_id]) >= RESUME_RATE_LIMIT:
        raise HTTPException(
            status_code=429,
            detail=f"Rate limit exceeded. Max {RESUME_RATE_LIMIT} resume generations per minute."
        )
    _rate_limit_store[user_id].append(now)


def _build_template_context(user: dict, payload: ResumePayload) -> dict:
    """Merges and sanitises all resume fields into a Jinja2 template context dict."""
    # Merge skills: cv + gained + additions, minus removals
    merged_cv     = list({_sanitise(s) for s in payload.cv_skills})
    merged_gained = list({_sanitise(s) for s in payload.gained_skills + payload.user_additions})
    removals      = {_sanitise(s) for s in payload.user_removals}
    merged_cv     = [s for s in merged_cv     if s not in removals]
    merged_gained = [s for s in merged_gained if s not in removals]

    # Respect user-specified order if provided
    if payload.order:
        order_map = {_sanitise(s): i for i, s in enumerate(payload.order)}
        all_skills = merged_cv + merged_gained
        all_skills.sort(key=lambda s: order_map.get(s, 9999))
        # Re-partition after sorting
        gained_set = set(merged_gained)
        merged_cv     = [s for s in all_skills if s not in gained_set]
        merged_gained = [s for s in all_skills if s in gained_set]

    return {
        "name":         _sanitise(payload.name or user.get("sub", "Professional")),
        "title":        _sanitise(payload.title or "Career Changer"),
        "email":        _sanitise(payload.email or ""),
        "linkedin":     _sanitise(payload.linkedin or ""),
        "location":     _sanitise(payload.location or ""),
        # User-edited canvas text; html.escape is applied to prevent XSS
        "summary":      _sanitise(payload.summary or ""),
        "education":    _sanitise(payload.education or ""),
        "cv_skills":    merged_cv,
        "gained_skills":merged_gained,
        "target_role":  _sanitise(payload.target_role or ""),
        "courses":      [
            {"name": _sanitise(c.name), "provider": _sanitise(c.provider or "")}
            for c in (payload.courses or [])
        ],
        "generated_at": datetime.now(timezone.utc).strftime("%B %d, %Y"),
    }


# ── GET /api/v1/resume/skills ─────────────────────────────────────────────────
@app.get("/api/v1/resume/skills")
async def get_resume_skills(request: Request, user=Depends(verify_token)):
    """
    Aggregates skills for the authenticated user:
    - `gained_skills`: pulled from the `user_skills` PostgreSQL table (verified completions)
    - `cv_skills`: passed by the frontend as a comma-separated query param (from SkillRadar state)
    - `merged`: deduplicated union of both lists
    """
    user_id = user.get("sub", "anonymous")

    # Accept cv skills from query params (frontend SkillRadar state)
    raw_cv = request.query_params.get("cv_skills", "")
    cv_skills = [s.strip() for s in raw_cv.split(",") if s.strip()] if raw_cv else []

    # Fetch gained skills from DB
    gained_skills: List[str] = []
    try:
        conn = _get_pg_conn()
        cur = conn.cursor()
        _ensure_user_skills_table(cur)
        cur.execute(
            "SELECT skill_name FROM user_skills WHERE user_id = %s ORDER BY completed_at DESC;",
            (user_id,)
        )
        gained_skills = [row[0] for row in cur.fetchall()]
        cur.close()
        conn.close()
    except HTTPException:
        raise
    except Exception as e:
        logger.warning(f"Could not fetch gained skills from DB for '{user_id}': {e}")
        # Non-fatal — return empty gained list rather than crashing

    merged = list(dict.fromkeys(cv_skills + gained_skills))  # preserves order, deduplicates

    return {
        "user_id":      user_id,
        "cv_skills":    cv_skills,
        "gained_skills":gained_skills,
        "merged":       merged,
    }


# ── POST /api/v1/resume/preview ───────────────────────────────────────────────
@app.post("/api/v1/resume/preview", response_class=HTMLResponse)
async def preview_resume(payload: ResumePayload, user=Depends(verify_token)):
    """
    Renders the resume as an HTML string for in-browser preview.
    Skips WeasyPrint — fast, no file download triggered.
    """
    ctx = _build_template_context(user, payload)
    try:
        template = _jinja_env.get_template("resume_template.html")
        html_str = template.render(**ctx)
    except Exception as e:
        logger.error(f"Template render error: {e}")
        raise HTTPException(status_code=500, detail="Failed to render resume template.")

    return HTMLResponse(content=html_str, status_code=200)


# ── POST /api/v1/resume/generate ─────────────────────────────────────────────
@app.post("/api/v1/resume/generate")
async def generate_resume(payload: ResumePayload, user=Depends(verify_token)):
    """
    Full pipeline: sanitise → merge → Jinja2 render → WeasyPrint PDF → stream download.
    Rate-limited to RESUME_RATE_LIMIT calls/minute per user.
    WeasyPrint is wrapped in a 30-second asyncio timeout.
    """
    user_id = user.get("sub", "anonymous")
    _check_rate_limit(user_id)

    ctx = _build_template_context(user, payload)

    # Step 1: Render Jinja2 template → HTML string
    try:
        template = _jinja_env.get_template("resume_template.html")
        html_str = template.render(**ctx)
    except Exception as e:
        logger.error(f"Template render error: {e}")
        raise HTTPException(status_code=500, detail="Failed to render resume template.")

    # Step 2: Convert HTML → PDF bytes via WeasyPrint (runs in thread pool, 30s timeout)
    def _render_pdf() -> bytes:
        return WeasyprintHTML(string=html_str).write_pdf()

    try:
        pdf_bytes: bytes = await asyncio.wait_for(
            asyncio.get_event_loop().run_in_executor(None, _render_pdf),
            timeout=30.0
        )
    except asyncio.TimeoutError:
        raise HTTPException(status_code=504, detail="PDF generation timed out (>30s). Please try again.")
    except Exception as e:
        logger.error(f"WeasyPrint error for user '{user_id}': {e}")
        raise HTTPException(status_code=500, detail="PDF generation failed.")

    # Step 3: Stream PDF bytes back as a download
    filename = f"resume_{ctx['name'].replace(' ', '_')}.pdf"
    logger.info(f"Resume PDF generated for user '{user_id}' ({len(pdf_bytes)} bytes).")

    return StreamingResponse(
        iter([pdf_bytes]),
        media_type="application/pdf",
        headers={"Content-Disposition": f'attachment; filename="{filename}"'}
    )


# ── POST /api/resume/pdf  (alias for /api/v1/resume/generate) ─────────────────
# Provided as a convenience alias so clients calling the shorter path still work.
@app.post("/api/resume/pdf")
async def resume_pdf_alias(payload: ResumePayload, user=Depends(verify_token)):
    """Alias: delegates directly to the full generate_resume pipeline."""
    return await generate_resume(payload, user)


@app.on_event("startup")
async def startup_event():
    logger.info("--- Active FastAPI Routes ---")
    for route in app.routes:
        logger.info(f"Active Route: {route.path} [{getattr(route, 'name', '')}]")
    logger.info("---------------------------")

if __name__ == "__main__":
    import uvicorn
    import os
    port = int(os.environ.get("PORT", 8080))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
