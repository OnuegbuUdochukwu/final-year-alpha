import os
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
    2. Runs LLM to extract full structured resume matching a specific JSON schema.
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
        logger.error(f"Unexpected error during resume processing: {e}")
        raise HTTPException(status_code=500, detail="Internal processing error.")
        


    if not raw_text:
        raise HTTPException(status_code=415, detail="Could not extract text or unsupported format.")

    with open("raw_resume.md", "w", encoding="utf-8") as f:
        f.write(raw_text)

    from shared.llm_service import query_llm_standard, parse_json_from_llm

    # Limit text length to avoid API token/context limits
    truncated_text = raw_text[:6000] if len(raw_text) > 6000 else raw_text

    extraction_prompt = (
        "You are an expert AI resume-parsing API. Your sole purpose is to analyze the provided resume text and return a strictly structured JSON object matching the requested schema. \n\n"
        "You are receiving the candidate's resume formatted in Markdown. Pay close attention to structural markers like `#`, `##`, `**bold text**`, and list items (`-` or `*`).\n\n"
        "CRITICAL PARSING DIRECTIVES:\n\n"
        "1. CONTACT INFORMATION EXTRACTION (HIGH PRIORITY):\n"
        "   - The candidate's contact information (name, email, phone, location, LinkedIn/portfolio) resides at the very beginning of the Markdown text.\n"
        "   - This information may completely lack Markdown syntax (it might just be a flat string of words). You MUST explicitly scan the first 10-15 lines of the document to locate and isolate these elements.\n"
        "   - If the contact info is mashed together or contains messy formatting/typos (e.g., '+1-(234)-555-1234@Ernail' or combined lines), use your semantic understanding to clean, separate, and format them into the distinct JSON keys: `email`, `phone`, `location`, and `linkedin`. Do not return null if the info is present but messy.\n\n"
        "2. WORK EXPERIENCE & BOUNDARY ENFORCEMENT:\n"
        "   - Use Markdown headers and bolded labels to identify Job Titles and Company Names.\n"
        "   - When you see a Markdown list item (`-` or `*`), it represents a specific duty. You MUST assign these list items ONLY to the `duties` array of the bolded Job Title immediately preceding them.\n"
        "   - Treat job headers like a brick wall. The moment you hit a new bolded Job Title, Company Name, or Date range, you must close out the current experience array index and start a new one. Do not allow bullet points to bleed across boundary lines.\n"
        "   - Categorize any explicit \"Volunteering\" sections into the `experience` array as individual, fully fleshed-out entries.\n\n"
        "3. SUMMARY SECTION:\n"
        "   - Prioritize a \"Summary\" or \"Professional Summary\" block over volunteering information for the root-level `summary` key.\n\n"
        "OUTPUT CONSTRAINT:\n"
        "Return ONLY a raw, valid JSON object matching the schema. Do not provide markdown code block wrappers (```json), conversational intro text, or trailing explanations. If an array or string is missing, map it to an empty array [] or empty string \"\".\n\n"
        "JSON SCHEMA TO MATCH:\n"
        "{\n"
        '  "name": "Full Name",\n'
        '  "title": "Professional Title",\n'
        '  "contact": {"email": "...", "phone": "...", "location": "...", "linkedin": "..."},\n'
        '  "summary": "Full professional summary...",\n'
        '  "experience": [\n'
        "    {\n"
        '      "title": "Job Title",\n'
        '      "company": "Company Name",\n'
        '      "location": "City, State",\n'
        '      "dates": "Start - End",\n'
        '      "duties": ["Bullet point 1", "Bullet point 2"]\n'
        "    }\n"
        "  ],\n"
        '  "education": [\n'
        "    {\n"
        '      "degree": "Degree Name",\n'
        '      "school": "Institution Name",\n'
        '      "location": "City, State",\n'
        '      "dates": "Start - End"\n'
        "    }\n"
        "  ],\n"
        '  "skills": ["Skill 1", "Skill 2"]\n'
        "}\n\n"
        f"Resume Markdown:\n{truncated_text}"
    )

    try:
        content = query_llm_standard(
            prompt=extraction_prompt,
            model="meta-llama/Meta-Llama-3-8B-Instruct",
            max_new_tokens=2000,
        )
    except Exception as e:
        logger.error(f"Failed to communicate with Hugging Face: {e}")
        if os.path.exists("raw_resume.md"):
            os.unlink("raw_resume.md")
        raise HTTPException(status_code=502, detail=f"Bad Gateway to Hugging Face Inference API: {str(e)}")

    try:
        biography = parse_json_from_llm(content)
        
        # Merge statically extracted metadata with the LLM data
        from reconciler import reconcile_resume_data
        biography = reconcile_resume_data(raw_text, biography)
        
        # Ensure 'skills' exists as a list for normalization
        raw_skills_list = biography.get("skills", [])
        if not isinstance(raw_skills_list, list):
            raw_skills_list = []

        formatted_skills = []
        for s in raw_skills_list:
            if isinstance(s, dict) and "name" in s:
                formatted_skills.append({"name": s["name"], "confidence": s.get("confidence", 0.95)})
            elif isinstance(s, str):
                formatted_skills.append({"name": s, "confidence": 0.95})

        parsed_data = {
            "skills": formatted_skills,
            "filename": file.filename,
            "biography": biography,
        }

        # 3. Skill Normalization via HF Standard Inference API
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
                    "Canonical List provided. You MUST return ONLY a raw JSON array of strings. "
                    "Do NOT wrap the JSON in markdown formatting, code fences (```), or provide any conversational filler.\n\n"
                    f"Raw Skills: {raw_skill_names}\n\n"
                    f"Canonical List: {canonical_skills}"
                )

                normalized_text = query_llm_standard(
                    prompt=normalization_prompt,
                    model="meta-llama/Meta-Llama-3-8B-Instruct",
                    max_new_tokens=1500,
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
        return {
            "skills": [],
            "filename": file.filename,
            "biography": {},
            "normalized_skills": [],
            "error": "Could not parse full structure from LLM response.",
        }
    finally:
        # Purge the raw markdown to prevent storage bloat
        if os.path.exists("raw_resume.md"):
            try:
                os.unlink("raw_resume.md")
            except OSError as e:
                logger.warning(f"Failed to delete raw_resume.md: {e}")

    logger.info(
        f"Successfully parsed resume. "
        f"Extracted {len(formatted_skills)} skills. "
        f"Biography sections: summary={bool(biography.get('summary', False))}, "
        f"education={bool(biography.get('education', False))}, experience={bool(biography.get('experience', False))}."
    )
    return parsed_data

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False)
