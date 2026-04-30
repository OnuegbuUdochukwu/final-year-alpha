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

# Initialize our components (but don't load the heavy ML model until app startup)
# Using mrm8488/bert-tiny-finetuned-ner for lightweight out-of-the-box NER extraction
ner_manager = NERModelManager("mrm8488/bert-tiny-finetuned-ner")
normalizer = SkillNormalizer()

@asynccontextmanager
async def lifespan(app: FastAPI):
    """Lifecycle manager for FastAPI to load heavy models precisely once."""
    logger.info("Initializing NLP Service...")
    # Load the NER model into memory on server boot
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

    # 2. Entity Recognition
    try:
        # Run the text through the Hugging Face pipeline
        entities_data = ner_manager.extract_entities(raw_text)
        
        simulated_entities = []
        if isinstance(entities_data, list) and len(entities_data) > 0 and isinstance(entities_data[0], dict) and 'word' in entities_data[0]:
            # Extracted actual entities from a fine-tuned NER model
            simulated_entities = [ent['word'] for ent in entities_data]
        else:
            # Fallback to simulated keyword hunt
            words = raw_text.split()
            simulated_entities = [word.strip(".,();:") for word in words if len(word) > 1]
    except Exception as e:
        logger.error(f"NER Extraction failed: {e}")
        raise HTTPException(status_code=500, detail="NLP modeling failed.")

    # 3. Normalization
    try:
        canonical_skills = normalizer.normalize_list(simulated_entities)
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
