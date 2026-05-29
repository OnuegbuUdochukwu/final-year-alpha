import os
import re
import json
import logging
import requests
from fastapi import FastAPI, UploadFile, File, HTTPException
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator

from extractor import DocumentExtractor

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI."""
    logger.info("Initializing NLP Service...")
    yield
    logger.info("Shutting down NLP Service...")

# Create the FastAPI app instance
app = FastAPI(title="NLP Service API", version="1.0.0", lifespan=lifespan)

# Expose Prometheus metrics at /metrics
Instrumentator().instrument(app).expose(app)

@app.get("/health")
def health_check():
    """Simple health check endpoint."""
    return {"status": "ok", "message": "NLP Service is running."}

@app.post("/parse-resume")
async def parse_resume(file: UploadFile = File(...)):
    """
    Accepts a PDF, DOCX, or TXT file upload.
    1. Extracts raw text.
    2. Runs Named Entity Recognition (NER) to find skills.
    3. Normalizes discovered skills into a standard vocabulary.
    """
    if not file.filename:
        raise HTTPException(status_code=400, detail="No file provided")

    logger.info(f"Received file for processing: {file.filename}")

    # Read the bytes into memory
    file_bytes = await file.read()
    if not file_bytes:
        raise HTTPException(status_code=400, detail="Uploaded file is empty")

    # 1. Text Extraction
    try:
        raw_text = DocumentExtractor.extract_from_bytes(file_bytes, file.filename)
    except Exception as e:
        logger.error(f"Extraction failed: {e}")
        raise HTTPException(status_code=500, detail="Failed to extract text from document.")

    if not raw_text:
        raise HTTPException(status_code=415, detail="Could not extract text or unsupported format.")

    # ──────────────────────────────────────────────────────────────────────────
    # 2. Phase 1: Resume Extraction via HF Standard Inference API
    # ──────────────────────────────────────────────────────────────────────────
    from shared.llm_service import query_llm_standard, parse_json_from_llm

    # Limit text length to avoid API token/context limits
    truncated_text = raw_text[:4000] if len(raw_text) > 4000 else raw_text

    extraction_prompt = (
        "Extract all technical skills from the following resume text. "
        "Return ONLY a valid JSON object with this schema: "
        '{ "skills": ["skill1", "skill2"], '
        '"experience": [{"role": "string", "company": "string", "years": "string"}], '
        '"education": [{"degree": "string", "institution": "string"}] }. '
        "Do not include introductory or concluding text.\n\n"
        f"Resume Text:\n{truncated_text}"
    )

    try:
        content = query_llm_standard(
            prompt=extraction_prompt,
            model="meta-llama/Meta-Llama-3-8B-Instruct",
            max_new_tokens=3000,
        )
    except Exception as e:
        logger.error(f"Failed to communicate with Hugging Face: {e}")
        raise HTTPException(status_code=502, detail=f"Bad Gateway to Hugging Face Inference API: {str(e)}")

    # 3. Parse JSON and transform the skills format for frontend compatibility
    try:
        parsed_data = parse_json_from_llm(content, expect_array=False)

        # Format the skills for frontend (which expects list of objects with 'name' and 'confidence')
        raw_skills = parsed_data.get("skills", [])
        formatted_skills = []
        for s in raw_skills:
            if isinstance(s, dict) and "name" in s:
                formatted_skills.append({
                    "name": s["name"],
                    "confidence": s.get("confidence", 0.95)
                })
            elif isinstance(s, str):
                formatted_skills.append({
                    "name": s,
                    "confidence": 0.95
                })

        parsed_data["skills"] = formatted_skills
        parsed_data["filename"] = file.filename

        # ──────────────────────────────────────────────────────────────────────
        # 4. Phase 2: Skill Normalization via HF Standard Inference API
        # ──────────────────────────────────────────────────────────────────────
        logger.info("Normalizing extracted skills against canonical Graph vocabulary...")
        try:
            graph_url = os.getenv("GRAPH_SERVICE_URL", "https://fyp-graph.onrender.com")
            resp = requests.get(f"{graph_url}/skills/canonical", timeout=5.0)
            if resp.status_code == 200:
                canonical_skills = resp.json()
                raw_skill_names = [s["name"] for s in formatted_skills]

                normalization_prompt = (
                    "Map the following raw skills extracted from a resume to their exact matches "
                    "in our canonical database. You must ONLY output skills that exist in the "
                    "Canonical List provided. Return ONLY a valid JSON array of strings.\n\n"
                    f"Raw Skills: {raw_skill_names}\n\n"
                    f"Canonical List: {canonical_skills}"
                )

                normalized_text = query_llm_standard(
                    prompt=normalization_prompt,
                    model="meta-llama/Meta-Llama-3-8B-Instruct",
                    max_new_tokens=3000,
                )

                try:
                    normalized_names = parse_json_from_llm(normalized_text, expect_array=True)
                    parsed_data["normalized_skills"] = normalized_names
                    logger.info(f"Normalized {len(raw_skill_names)} raw skills to {len(normalized_names)} canonical skills.")
                except ValueError as parse_err:
                    logger.warning(f"Could not parse normalization JSON: {parse_err}")
                    parsed_data["normalized_skills"] = []
            else:
                logger.warning(f"Failed to fetch canonical skills from Graph Service: HTTP {resp.status_code}")
                parsed_data["normalized_skills"] = []
        except Exception as norm_err:
            logger.error(f"Error during skill normalization: {norm_err}")
            parsed_data["normalized_skills"] = []

    except Exception as e:
        logger.error(f"Failed to parse LLM response JSON: {e}. Raw content: {content}")
        raise HTTPException(status_code=500, detail="Failed to parse structured resume data.")

    logger.info(f"Successfully parsed resume via LLM. Extracted {len(formatted_skills)} skills.")
    return parsed_data

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False)
