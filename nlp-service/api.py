import logging
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
    from shared.llm_service import test_llm_connection
    test_llm_connection()
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

    # 2. Extract structured data via Hugging Face Serverless Inference API
    import re
    import json
    from shared.llm_service import query_llm

    # Limit text length to avoid API token/context limits
    truncated_text = raw_text[:4000] if len(raw_text) > 4000 else raw_text

    system_prompt = (
        "You are an expert HR data extractor. Extract the data from the provided resume text into strictly formatted JSON. "
        "Do not include markdown. Schema: { 'skills': ['skill1', 'skill2'], 'experience': [{'role': 'string', 'company': 'string', 'years': 'string'}], 'education': [{'degree': 'string', 'institution': 'string'}] }"
    )

    try:
        content = query_llm(
            system_prompt=system_prompt,
            user_prompt=f"Extract resume details from this text:\n\n{truncated_text}",
            model="Qwen/Qwen2.5-7B-Instruct",
            max_tokens=1000,
            temperature=0.1
        )
    except Exception as e:
        logger.error(f"Failed to communicate with Hugging Face: {e}")
        raise HTTPException(status_code=502, detail=f"Bad Gateway to Hugging Face Inference API: {str(e)}")

    # 3. Parse JSON and transform the skills format for frontend compatibility
    try:
        # Clean markdown fences if any
        cleaned = re.sub(r"```(?:json)?", "", content, flags=re.IGNORECASE).strip()
        match = re.search(r"\{.*\}", cleaned, re.DOTALL)
        if not match:
            raise ValueError("No JSON object found in response.")
            
        parsed_data = json.loads(match.group(0))
        
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
        
        # 4. Resume Normalization Layer
        logger.info("Normalizing extracted skills against canonical Graph vocabulary...")
        try:
            import requests
            graph_url = os.getenv("GRAPH_SERVICE_URL", "http://graph-service:8001")
            resp = requests.get(f"{graph_url}/skills/canonical", timeout=5.0)
            if resp.status_code == 200:
                canonical_skills = resp.json()
                raw_skill_names = [s["name"] for s in formatted_skills]
                
                normalization_prompt = (
                    "You are a skill normalization engine. Map these raw resume skills to the closest standardized skill names from our graph database.\n"
                    f"Graph Database Skills: {canonical_skills}\n"
                    "Return ONLY a JSON array of strings containing the matched standard names. Example: [\"Python\", \"HTML & CSS\"]. "
                    "If a skill doesn't match anything closely, omit it."
                )
                
                normalized_text = query_llm(
                    system_prompt=normalization_prompt,
                    user_prompt=f"Raw resume skills: {raw_skill_names}",
                    max_tokens=500,
                    temperature=0.0
                )
                
                clean_norm = re.sub(r"```(?:json)?", "", normalized_text, flags=re.IGNORECASE).strip()
                norm_match = re.search(r"\[.*\]", clean_norm, re.DOTALL)
                if norm_match:
                    normalized_names = json.loads(norm_match.group(0))
                    parsed_data["normalized_skills"] = normalized_names
                    logger.info(f"Normalized {len(raw_skill_names)} raw skills to {len(normalized_names)} canonical skills.")
                else:
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
    # Local dev runner
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
