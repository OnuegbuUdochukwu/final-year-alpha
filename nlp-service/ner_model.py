import os
import logging
import requests

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

# Hugging Face Inference API endpoint for dslim/bert-base-NER
API_URL = "https://api-inference.huggingface.co/models/dslim/bert-base-NER"


class NERModelManager:
    """Offloads NER inference to the Hugging Face Inference API.

    This avoids loading a ~400MB model into memory, which is critical
    for Render's free tier (512MB RAM limit).
    """

    def __init__(self, model_name: str = "dslim/bert-base-NER"):
        self.model_name = model_name
        self.api_url = f"https://api-inference.huggingface.co/models/{model_name}"
        self.headers = {}
        self._ready = False

    def load_model(self):
        """Configure the API headers. No model is loaded locally."""
        hf_token = os.getenv("HF_TOKEN", "")
        if hf_token:
            self.headers = {"Authorization": f"Bearer {hf_token}"}
            logger.info(f"HF Inference API configured for {self.model_name} (token set).")
        else:
            logger.warning("HF_TOKEN not set – API calls will be rate-limited.")
            self.headers = {}
        self._ready = True
        return None  # No local pipeline to return

    def extract_entities(self, text: str):
        """Send text to the Hugging Face Inference API and return entities."""
        if not self._ready:
            logger.error("Manager not initialized. Call load_model() first.")
            return []

        # Truncate to ~2000 chars to stay within API limits
        truncated = text[:2000] if len(text) > 2000 else text

        logger.info(f"Calling HF Inference API ({self.model_name}) with {len(truncated)} chars...")

        try:
            response = requests.post(
                self.api_url,
                headers=self.headers,
                json={"inputs": truncated},
                timeout=30
            )
            response.raise_for_status()
            results = response.json()

            # The API returns a list of entity dicts with 'word', 'entity_group', 'score', etc.
            if isinstance(results, list):
                logger.info(f"HF API returned {len(results)} entities.")
                return results
            else:
                logger.warning(f"Unexpected API response format: {str(results)[:200]}")
                return []

        except requests.exceptions.HTTPError as e:
            logger.error(f"HF Inference API HTTP error: {e} – Response: {response.text[:200]}")
            return []
        except requests.exceptions.RequestException as e:
            logger.error(f"HF Inference API connection error: {e}")
            return []


if __name__ == "__main__":
    from dotenv import load_dotenv
    load_dotenv()

    logger.info("Starting NER Model Manager test (HF Inference API)...")
    manager = NERModelManager("dslim/bert-base-NER")
    manager.load_model()

    sample_text = "I have 5 years of experience with Python, JavaScript, and Docker in AWS."
    entities = manager.extract_entities(sample_text)
    print(f"Test Extraction Complete: {entities}")
