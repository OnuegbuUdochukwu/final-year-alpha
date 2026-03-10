import os
import logging
import torch
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

class NERModelManager:
    """Manages the loading and execution of the NER Transformer model."""
    
    def __init__(self, model_name: str = "distilbert-base-uncased"):
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        self.nlp_pipeline = None
        
    def load_model(self):
        """Downloads (if necessary) and loads the model into memory."""
        logger.info(f"Loading tokenizer for {self.model_name}...")
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name)
        
        logger.info(f"Loading model for {self.model_name}...")
        # Note: distilbert-base-uncased doesn't have pre-trained NER weights,
        # but we load it as requested for the tokenization pipeline scaffold.
        # Down the line, this might be swapped for a fine-tuned NER model (e.g. dslim/distilbert-NER).
        try:
            self.model = AutoModelForTokenClassification.from_pretrained(self.model_name)
            self.nlp_pipeline = pipeline("ner", model=self.model, tokenizer=self.tokenizer, grouped_entities=True)
            logger.info("NER Pipeline initialized successfully.")
        except Exception as e:
            logger.warning(f"Failed to load TokenClassification head (expected for base models): {e}")
            logger.info("Initializing base pipeline instead.")
            self.nlp_pipeline = pipeline("feature-extraction", model=self.model_name, tokenizer=self.tokenizer)
            
        return self.nlp_pipeline

    def extract_entities(self, text: str):
        """Run the text through the NLP pipeline."""
        if not self.nlp_pipeline:
            logger.error("Pipeline not loaded. Call load_model() first.")
            return []
            
        logger.info("Extracting entities...")
        # Truncate text if it's too long for the model max length (usually 512 tokens)
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        # Decode back to string for pipeline, or just pass text and rely on pipeline truncation
        truncated_text = self.tokenizer.decode(inputs['input_ids'][0], skip_special_tokens=True)
        
        results = self.nlp_pipeline(truncated_text)
        return results

if __name__ == "__main__":
    # Test initialization
    logger.info("Starting NER Model Manager test...")
    manager = NERModelManager("distilbert-base-uncased")
    manager.load_model()
    
    sample_text = "I have 5 years of experience with Python, JavaScript, and Docker in AWS."
    entities = manager.extract_entities(sample_text)
    print("Test Extraction Complete.")
