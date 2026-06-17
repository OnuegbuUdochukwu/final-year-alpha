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


# ──────────────────────────────────────────────────────────────────────────────
# Pre-LLM Chunking: Deterministically parse resume into biographical sections.
# This avoids spending LLM tokens on structured data that regex can handle.
# ──────────────────────────────────────────────────────────────────────────────

# Ordered list of known resume section headers and their canonical category.
# Checked in order — first match wins for each line.
_SECTION_PATTERNS = [
    (re.compile(r'^(SUMMARY|PROFESSIONAL\s+SUMMARY|PROFILE|CAREER\s+OBJECTIVE|OBJECTIVE|ABOUT\s+ME)\s*$', re.IGNORECASE), 'summary'),
    (re.compile(r'^(EDUCATION|ACADEMIC\s+BACKGROUND|QUALIFICATIONS|ACADEMIC\s+QUALIFICATIONS)\s*$', re.IGNORECASE), 'education'),
    (re.compile(r'^(EXPERIENCE|WORK\s+EXPERIENCE|PROFESSIONAL\s+EXPERIENCE|WORK\s+HISTORY|EMPLOYMENT|EMPLOYMENT\s+HISTORY)\s*$', re.IGNORECASE), 'experience'),
    (re.compile(r'^(SKILLS|TECHNICAL\s+SKILLS|CORE\s+COMPETENCIES|KEY\s+SKILLS|COMPETENCIES)\s*$', re.IGNORECASE), 'skills_section'),
    (re.compile(r'^(PROJECTS|PERSONAL\s+PROJECTS|NOTABLE\s+PROJECTS)\s*$', re.IGNORECASE), 'projects'),
    (re.compile(r'^(CERTIFICATIONS?|CERTIFICATES?|LICENSES?\s+&\s+CERTIFICATIONS?)\s*$', re.IGNORECASE), 'certifications'),
]


def chunk_resume_text(raw_text: str) -> dict:
    """
    Deterministically splits raw resume text into logical sections using
    common resume header patterns (all-caps or title-case headings).

    Returns a dict with keys: summary, education, experience.
    Any unrecognised text before the first header is treated as the summary
    (common for resumes that open with a name/contact block followed by text).
    """
    lines = raw_text.splitlines()
    sections: dict[str, list[str]] = {
        'summary': [],
        'education': [],
        'experience': [],
    }
    current_section: str | None = 'summary'  # Text before the first header → summary

    for line in lines:
        stripped = line.strip()
        if not stripped:
            # Preserve blank lines within the current section for readability
            if current_section and sections[current_section] or current_section == 'summary':
                if current_section in sections:
                    sections[current_section].append('')
            continue

        matched_section = None
        for pattern, section_key in _SECTION_PATTERNS:
            if pattern.match(stripped):
                matched_section = section_key
                break

        if matched_section is not None:
            # Only track sections we actually store in biography
            if matched_section in sections:
                current_section = matched_section
            else:
                # Section like skills_section / projects — stop appending to biography sections
                current_section = None
        else:
            if current_section and current_section in sections:
                sections[current_section].append(stripped)

    # Join and clean up each section
    return {
        key: '\n'.join(lines).strip()
        for key, lines in sections.items()
    }

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
    # 2. Phase 1 (Pre-LLM): Deterministic chunking of biographical sections.
    # This extracts Summary, Education, and Experience without any LLM call,
    # saving tokens and reducing latency for the skill extraction step below.
    # ──────────────────────────────────────────────────────────────────────────
    biography = chunk_resume_text(raw_text)
    logger.info(
        f"Pre-LLM chunking complete. "
        f"summary={len(biography['summary'])} chars, "
        f"education={len(biography['education'])} chars, "
        f"experience={len(biography['experience'])} chars."
    )

    # ──────────────────────────────────────────────────────────────────────────
    # 3. Phase 2: Skills-only Extraction via HF Standard Inference API.
    # The LLM is now ONLY asked to identify technical skills — a much simpler
    # task that requires far fewer tokens than full structured extraction.
    # ──────────────────────────────────────────────────────────────────────────
    from shared.llm_service import query_llm_standard, parse_json_from_llm

    # Limit text length to avoid API token/context limits
    truncated_text = raw_text[:4000] if len(raw_text) > 4000 else raw_text

    extraction_prompt = (
        "You are a resume parser. Extract all technical skills, tools, programming languages, "
        "and frameworks mentioned in the resume text below. "
        "Return ONLY a raw JSON array of strings with no markdown, no explanation, and no extra text. "
        'Example output: ["Python", "React", "PostgreSQL"]\n\n'
        f"Resume Text:\n{truncated_text}"
    )

    try:
        content = query_llm_standard(
            prompt=extraction_prompt,
            model="meta-llama/Meta-Llama-3-8B-Instruct",
            max_new_tokens=500,  # Skills-only array needs far fewer tokens than full JSON
        )
    except Exception as e:
        logger.error(f"Failed to communicate with Hugging Face: {e}")
        raise HTTPException(status_code=502, detail=f"Bad Gateway to Hugging Face Inference API: {str(e)}")

    # 4. Parse the skills-only JSON array and format for frontend compatibility
    try:
        # The prompt now asks for a plain array — parse it as such.
        raw_skills_list = parse_json_from_llm(content, expect_array=True)

        # Normalise: handle both plain strings and dicts (LLM might still wrap them)
        formatted_skills = []
        for s in raw_skills_list:
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

        parsed_data = {
            "skills": formatted_skills,
            "filename": file.filename,
            # Include deterministically extracted biography so the gateway can persist it
            "biography": biography,
        }

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
                    "Canonical List provided. You MUST return ONLY a raw JSON array of strings. "
                    "Do NOT wrap the JSON in markdown formatting, code fences (```), or provide any conversational filler.\n\n"
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
        # Even if skill parsing fails, return the biography so the gateway can still persist it
        return {
            "skills": [],
            "filename": file.filename,
            "biography": biography,
            "normalized_skills": [],
            "error": "Could not parse skills from LLM response.",
        }

    logger.info(
        f"Successfully parsed resume. "
        f"Extracted {len(formatted_skills)} skills. "
        f"Biography sections: summary={bool(biography['summary'])}, "
        f"education={bool(biography['education'])}, experience={bool(biography['experience'])}."
    )
    return parsed_data

if __name__ == "__main__":
    import uvicorn
    port = int(os.environ.get("PORT", 8000))
    uvicorn.run("api:app", host="0.0.0.0", port=port, reload=False)
