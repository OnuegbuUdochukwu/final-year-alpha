import os
import time
import html
import logging
import asyncio
import httpx
import psycopg2
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


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
