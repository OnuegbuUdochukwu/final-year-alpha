import os
import time
import logging
import httpx
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

NLP_SERVICE_URL = os.getenv("NLP_SERVICE_URL", "http://localhost:8000")
GRAPH_SERVICE_URL = os.getenv("GRAPH_SERVICE_URL", "http://localhost:8001")

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

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

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
    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{NLP_SERVICE_URL}/parse-resume",
            content=body,
            headers=headers
        )
    return JSONResponse(status_code=resp.status_code, content=resp.json())

@app.get("/api/find-path")
async def proxy_find_path(request: Request, _user=Depends(verify_token)):
    """Proxy: GET /api/find-path?... → graph-service:8001/find-path"""
    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.get(
            f"{GRAPH_SERVICE_URL}/find-path",
            params=dict(request.query_params)
        )
    return JSONResponse(status_code=resp.status_code, content=resp.json())

@app.post("/api/complete-step")
async def proxy_complete_step(request: Request, _user=Depends(verify_token)):
    """Proxy: POST /api/complete-step → graph-service:8001/complete-step"""
    body = await request.json()
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp = await client.post(
            f"{GRAPH_SERVICE_URL}/complete-step",
            json=body
        )
    return JSONResponse(status_code=resp.status_code, content=resp.json())

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8080, reload=True)
