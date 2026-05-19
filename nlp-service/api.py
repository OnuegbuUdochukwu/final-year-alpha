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
    logger.info("Initializing NLP Service (Mistral LLM mode)...")
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

    # 2. Extract structured data via Hugging Face Serverless Inference API (Mistral-7B)
    import os
    import re
    import json
    from huggingface_hub import InferenceClient

    hf_token = os.getenv("HF_TOKEN", "")
    if not hf_token:
        logger.error("HF_TOKEN is not set.")
        raise HTTPException(status_code=500, detail="Inference API token is missing.")

    client = InferenceClient(api_key=hf_token)

    # Limit text length to avoid API token/context limits
    truncated_text = raw_text[:4000] if len(raw_text) > 4000 else raw_text

    system_prompt = (
        "You are an expert HR data extractor. Extract the data from the provided resume text into strictly formatted JSON. "
        "Do not include markdown. Schema: { 'skills': ['skill1', 'skill2'], 'experience': [{'role': 'string', 'company': 'string', 'years': 'string'}], 'education': [{'degree': 'string', 'institution': 'string'}] }"
    )

    try:
        response = client.chat.completions.create(
            model="mistralai/Mistral-7B-Instruct-v0.3",
            messages=[
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": f"Extract resume details from this text:\n\n{truncated_text}"}
            ],
            max_tokens=1000,
            temperature=0.1,
        )
        
        content = response.choices[0].message.content
            
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
        
    except Exception as e:
        logger.error(f"Failed to parse LLM response JSON: {e}. Raw content: {content}")
        raise HTTPException(status_code=500, detail="Failed to parse structured resume data.")

    logger.info(f"Successfully parsed resume via LLM. Extracted {len(formatted_skills)} skills.")
    return parsed_data

if __name__ == "__main__":
    import uvicorn
    # Local dev runner
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
