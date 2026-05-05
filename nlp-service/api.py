import logging
from fastapi import FastAPI, UploadFile, File, HTTPException
from contextlib import asynccontextmanager
from prometheus_fastapi_instrumentator import Instrumentator

from extractor import DocumentExtractor
from ner_model import NERModelManager
from normalizer import SkillNormalizer

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

# Initialize our components
# NER inference is offloaded to Hugging Face Inference API (no local model)
ner_manager = NERModelManager("dslim/bert-base-NER")
normalizer = SkillNormalizer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI – configures the HF API client."""
    logger.info("Initializing NLP Service (HF Inference API mode)...")
    # Configure API headers (no heavy model loaded into memory)
    ner_manager.load_model()
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

    # 2. Entity Recognition (via HF Inference API)
    try:
        entities_data = ner_manager.extract_entities(raw_text)
        
        extracted_words = []
        if isinstance(entities_data, list) and len(entities_data) > 0 and isinstance(entities_data[0], dict):
            # HF Inference API returns dicts with 'word', 'entity_group', 'score'
            extracted_words = [ent['word'] for ent in entities_data if 'word' in ent]
        
        if not extracted_words:
            # Fallback to keyword extraction if API returned nothing useful
            logger.warning("NER returned no entities, falling back to keyword extraction.")
            words = raw_text.split()
            extracted_words = [word.strip(".,();:") for word in words if len(word) > 1]
    except Exception as e:
        logger.error(f"NER Extraction failed: {e}")
        raise HTTPException(status_code=500, detail="NLP modeling failed.")

    # 3. Normalization
    try:
        canonical_skills = normalizer.normalize_list(extracted_words)
    except Exception as e:
        logger.error(f"Normalization failed: {e}")
        raise HTTPException(status_code=500, detail="Skill mapping failed.")

    logger.info(f"Successfully parsed resume. Extracted {len(canonical_skills)} normalized skills.")
    
    return {
        "filename": file.filename,
        "extracted_skills": canonical_skills,
        "raw_text_length": len(raw_text)
    }

if __name__ == "__main__":
    import uvicorn
    # Local dev runner
    uvicorn.run("api:app", host="0.0.0.0", port=8000, reload=True)
