"""
AI Career Pathfinder – Backend Stress Test Suite
=================================================
Tool   : Locust  (https://locust.io)
Target : API Gateway  →  http://localhost:8080
Date   : 2026-04-20

Endpoints under test
---------------------
PUBLIC
  GET  /health                     — gateway liveness probe
  POST /login                      — JWT authentication

PROTECTED  (Bearer token required – injected automatically)
  POST /api/parse-resume           — NLP service proxy  (file upload)
  GET  /api/find-path              — A* + LP pathfinder  (graph service proxy)
  POST /api/complete-step          — progress webhook  (Postgres write)
  GET  /api/current-skills/{user}  — skill state restore  (Postgres read)

Usage
-----
  # Install
  pip install locust

  # Quick smoke test (10 users, 2 minutes)
  locust -f locustfile.py --headless -u 10 -r 2 --run-time 2m --host http://localhost:8080

  # Full stress test (200 users, 30-minute ramp)
  locust -f locustfile.py --headless -u 200 -r 10 --run-time 30m --host http://localhost:8080

  # Interactive web UI (http://localhost:8089)
  locust -f locustfile.py --host http://localhost:8080
"""

import os
import json
import random
import logging
from io import BytesIO

from locust import HttpUser, task, between, events
from locust.exception import RescheduleTask

# ──────────────────────────────────────────────────────────────────────────────
# Configuration
# ──────────────────────────────────────────────────────────────────────────────

GATEWAY_URL = os.getenv("GATEWAY_URL", "http://localhost:8080")

# Demo credentials matching DEMO_USERS in api-gateway/main.py
CREDENTIALS = [
    {"username": "student", "password": "fyp2024"},
    {"username": "admin",   "password": "password123"},
]

# Realistic career goal targets (must match Neo4j Role nodes)
CAREER_TARGETS = [
    "Machine Learning",
    "Data Scientist",
    "Software Engineer",
    "Data Engineer",
    "Backend Developer",
    "Frontend Developer",
    "DevOps Engineer",
    "Cloud Architect",
]

# Skills from the canonical normalizer list  (a representative sample)
SKILL_NAMES = [
    "Python", "SQL", "Docker", "React", "JavaScript",
    "Machine Learning", "Data Analysis", "Git",
    "PostgreSQL", "REST APIs", "TypeScript", "Pandas",
    "FastAPI", "Neo4j", "NumPy", "Node.js",
]

# Minimal synthetic PDF bytes (valid PDF skeleton — 1-page, parseable by pdfplumber)
SYNTHETIC_PDF = (
    b"%PDF-1.4\n"
    b"1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n"
    b"2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
    b"3 0 obj<</Type/Page/MediaBox[0 0 612 792]/Parent 2 0 R"
    b"/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
    b"4 0 obj<</Length 120>>\nstream\n"
    b"BT /F1 12 Tf 72 720 Td "
    b"(John Doe - Software Engineer - Python, Docker, React, SQL, Machine Learning) Tj ET\n"
    b"endstream\nendobj\n"
    b"5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\n"
    b"xref\n0 6\n"
    b"0000000000 65535 f\r\n"
    b"0000000009 00000 n\r\n"
    b"0000000058 00000 n\r\n"
    b"0000000115 00000 n\r\n"
    b"0000000266 00000 n\r\n"
    b"0000000436 00000 n\r\n"
    b"trailer<</Size 6/Root 1 0 R>>\nstartxref\n512\n%%EOF\n"
)

logger = logging.getLogger("stress-test")


# ──────────────────────────────────────────────────────────────────────────────
# Shared event hooks
# ──────────────────────────────────────────────────────────────────────────────

@events.test_start.add_listener
def on_test_start(environment, **kwargs):
    logger.info("=" * 60)
    logger.info(" AI Career Pathfinder – Stress Test Starting")
    logger.info(f" Target host : {environment.host}")
    logger.info("=" * 60)


@events.test_stop.add_listener
def on_test_stop(environment, **kwargs):
    logger.info("=" * 60)
    logger.info(" Stress Test Complete.")
    logger.info("=" * 60)


# ──────────────────────────────────────────────────────────────────────────────
# User classes
# ──────────────────────────────────────────────────────────────────────────────

class AuthenticatedUser(HttpUser):
    """
    Base class.  Logs in once on spawn and attaches the JWT to every
    subsequent request via the 'auth_headers' attribute.
    Subclasses define @task methods to represent realistic usage patterns.
    """

    abstract = True
    wait_time = between(1, 3)   # seconds between tasks (simulates human think-time)

    # Populated after login
    auth_headers: dict = {}
    username: str = ""

    def on_start(self):
        """Called once per simulated user at spawn time."""
        cred = random.choice(CREDENTIALS)
        self.username = cred["username"]
        self._do_login(cred["username"], cred["password"])

    def _do_login(self, username: str, password: str):
        """POST /login — obtain JWT; store in auth_headers."""
        with self.client.post(
            "/login",
            json={"username": username, "password": password},
            name="POST /login",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200:
                data = resp.json()
                token = data.get("access_token", "")
                self.auth_headers = {"Authorization": f"Bearer {token}"}
                resp.success()
            else:
                resp.failure(f"Login failed: {resp.status_code} {resp.text}")
                raise RescheduleTask()

    def _re_auth_if_expired(self, response):
        """Re-authenticate if the server returns 401 (token expired mid-test)."""
        if response.status_code == 401:
            logger.warning(f"[{self.username}] Token expired — re-authenticating.")
            cred = next(c for c in CREDENTIALS if c["username"] == self.username)
            self._do_login(cred["username"], cred["password"])


# ─── Scenario A: Typical Student User ────────────────────────────────────────

class StudentUser(AuthenticatedUser):
    """
    Simulates a student who:
      - Frequently checks their career path  (most common action)
      - Occasionally marks skills complete   (moderate frequency)
      - Sometimes uploads a resume           (infrequent, heavy operation)
      - Occasionally checks their skill list (moderate frequency)

    Weight distribution models realistic usage:
      find-path    : 40%
      complete-step: 25%
      parse-resume : 15%
      current-skills: 15%
      health check : 5%
    """

    weight = 3   # 3× more StudentUsers than AdminUsers in the swarm

    # ── Task: GET /api/find-path ──────────────────────────────────────────────
    @task(8)
    def get_career_path(self):
        """Fetch an optimal A* career roadmap for a random target role."""
        target = random.choice(CAREER_TARGETS)
        starts = ["Foundation", "Python", "SQL", "JavaScript"]
        start  = random.choice(starts)

        with self.client.get(
            "/api/find-path",
            params={"target": target, "start": start},
            headers=self.auth_headers,
            name="GET /api/find-path",
            catch_response=True,
        ) as resp:
            self._re_auth_if_expired(resp)
            if resp.status_code == 200:
                data = resp.json()
                # Validate response shape
                if "path_nodes" not in data:
                    resp.failure("Missing 'path_nodes' in response")
                else:
                    resp.success()
            elif resp.status_code == 404:
                # 404 is valid (no path in graph for that target) — not a failure
                resp.success()
            elif resp.status_code == 503:
                resp.failure("Graph engine not initialised (503)")
            else:
                resp.failure(f"Unexpected status: {resp.status_code}")

    # ── Task: POST /api/complete-step ─────────────────────────────────────────
    @task(5)
    def complete_learning_step(self):
        """Mark a random skill as complete (progress webhook)."""
        skill = random.choice(SKILL_NAMES)

        with self.client.post(
            "/api/complete-step",
            json={"skill_name": skill},   # user_id is injected by the gateway from JWT
            headers=self.auth_headers,
            name="POST /api/complete-step",
            catch_response=True,
        ) as resp:
            self._re_auth_if_expired(resp)
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"complete-step failed: {resp.status_code} – {resp.text[:120]}")

    # ── Task: POST /api/parse-resume ─────────────────────────────────────────
    @task(3)
    def upload_resume(self):
        """Upload a synthetic PDF and validate skill extraction response."""
        files = {
            "file": ("resume.pdf", BytesIO(SYNTHETIC_PDF), "application/pdf")
        }
        # Remove Content-Type from auth headers for multipart — requests sets it automatically
        headers = {k: v for k, v in self.auth_headers.items() if k.lower() != "content-type"}

        with self.client.post(
            "/api/parse-resume",
            files=files,
            headers=headers,
            name="POST /api/parse-resume",
            catch_response=True,
        ) as resp:
            self._re_auth_if_expired(resp)
            if resp.status_code == 200:
                data = resp.json()
                if "extracted_skills" not in data:
                    resp.failure("Missing 'extracted_skills' in response")
                else:
                    resp.success()
            else:
                resp.failure(f"parse-resume failed: {resp.status_code} – {resp.text[:120]}")

    # ── Task: GET /api/current-skills/{user_id} ───────────────────────────────
    @task(3)
    def get_current_skills(self):
        """Fetch the user's completed skill list (state restore on page refresh)."""
        with self.client.get(
            f"/api/current-skills/{self.username}",
            headers=self.auth_headers,
            name="GET /api/current-skills/{user_id}",
            catch_response=True,
        ) as resp:
            self._re_auth_if_expired(resp)
            if resp.status_code == 200:
                data = resp.json()
                if "completed_skills" not in data:
                    resp.failure("Missing 'completed_skills' in response")
                else:
                    resp.success()
            else:
                resp.failure(f"current-skills failed: {resp.status_code}")

    # ── Task: GET /health ─────────────────────────────────────────────────────
    @task(1)
    def check_health(self):
        """Lightweight liveness probe — simulates load balancer / monitoring ping."""
        with self.client.get(
            "/health",
            name="GET /health",
            catch_response=True,
        ) as resp:
            if resp.status_code == 200 and resp.json().get("status") == "ok":
                resp.success()
            else:
                resp.failure(f"Health check failed: {resp.status_code}")


# ─── Scenario B: Admin / Automated Pipeline User ─────────────────────────────

class AdminUser(AuthenticatedUser):
    """
    Simulates an admin or CI pipeline that:
      - Hammers the /find-path endpoint for multiple targets simultaneously
      - Bulk-completes skills (simulating batch progress sync)
      - Reads skill states for multiple users
    """

    weight = 1   # Fewer admins than students

    @task(5)
    def bulk_find_paths(self):
        """Admin rapidly queries paths for all career targets."""
        target = random.choice(CAREER_TARGETS)
        with self.client.get(
            "/api/find-path",
            params={"target": target, "start": "Foundation"},
            headers=self.auth_headers,
            name="GET /api/find-path (admin-bulk)",
            catch_response=True,
        ) as resp:
            self._re_auth_if_expired(resp)
            if resp.status_code in (200, 404):
                resp.success()
            else:
                resp.failure(f"Bulk find-path: {resp.status_code}")

    @task(3)
    def bulk_complete_skills(self):
        """Simulate a batch skill-completion sync (e.g., external LMS import)."""
        # Complete 3 skills in rapid succession (simulates batch webhook)
        for skill in random.sample(SKILL_NAMES, 3):
            self.client.post(
                "/api/complete-step",
                json={"skill_name": skill},
                headers=self.auth_headers,
                name="POST /api/complete-step (admin-batch)",
            )

    @task(2)
    def read_student_state(self):
        """Admin reads skill state for the 'student' account (authorised)."""
        with self.client.get(
            "/api/current-skills/student",
            headers=self.auth_headers,
            name="GET /api/current-skills/{user_id} (admin-read)",
            catch_response=True,
        ) as resp:
            # Admin is allowed to read any user's data
            if resp.status_code == 200:
                resp.success()
            else:
                resp.failure(f"Admin skill-read: {resp.status_code}")


# ─── Scenario C: Auth Load Test ───────────────────────────────────────────────

class AuthHammerUser(HttpUser):
    """
    Isolated scenario: hammers the /login endpoint continuously.
    Used ONLY when you want to stress-test the auth layer in isolation.
    Excluded from the main swarm by default — enable via Locust tags:
      locust -f locustfile.py --tags auth-hammer
    """

    weight   = 0           # Disabled in the default run
    wait_time = between(0.1, 0.5)

    @task
    def login_stress(self):
        cred = random.choice(CREDENTIALS)
        self.client.post(
            "/login",
            json=cred,
            name="POST /login (auth-hammer)",
        )

    @task
    def bad_login_stress(self):
        """Ensures the gateway correctly rejects invalid credentials (no token leak)."""
        with self.client.post(
            "/login",
            json={"username": "hacker", "password": "wrongpassword"},
            name="POST /login (invalid)",
            catch_response=True,
        ) as resp:
            if resp.status_code == 401:
                resp.success()   # 401 is the correct, expected outcome
            else:
                resp.failure(f"Expected 401, got {resp.status_code}")
