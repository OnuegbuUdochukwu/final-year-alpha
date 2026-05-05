import os
import logging
from transformers import AutoTokenizer, AutoModelForTokenClassification, pipeline

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

class NERModelManager:
    """Manages the loading and execution of the NER Transformer model."""
    
    def __init__(self, model_name: str = "dslim/bert-base-NER"):
        self.model_name = model_name
        self.tokenizer = None
        self.model = None
        self.nlp_pipeline = None
        
    def load_model(self):
        """Downloads (if necessary) and loads the model into memory."""
        logger.info(f"Loading NER model: {self.model_name}...")
        
        # Use the slow tokenizer (use_fast=False) for maximum compatibility
        # on memory-constrained environments like Render free tier
        self.tokenizer = AutoTokenizer.from_pretrained(self.model_name, use_fast=False)
        self.model = AutoModelForTokenClassification.from_pretrained(self.model_name)
        
        # Use aggregation_strategy="simple" (replaces deprecated grouped_entities=True)
        self.nlp_pipeline = pipeline(
            "ner",
            model=self.model,
            tokenizer=self.tokenizer,
            aggregation_strategy="simple"
        )
        logger.info("NER Pipeline initialized successfully.")
        return self.nlp_pipeline

    def extract_entities(self, text: str):
        """Run the text through the NLP pipeline."""
        if not self.nlp_pipeline:
            logger.error("Pipeline not loaded. Call load_model() first.")
            return []
            
        logger.info("Extracting entities...")
        # Truncate text if it's too long for the model max length (usually 512 tokens)
        inputs = self.tokenizer(text, return_tensors="pt", truncation=True, max_length=512)
        truncated_text = self.tokenizer.decode(inputs['input_ids'][0], skip_special_tokens=True)
        
        results = self.nlp_pipeline(truncated_text)
        return results

if __name__ == "__main__":
    # Test initialization
    logger.info("Starting NER Model Manager test...")
    manager = NERModelManager("dslim/bert-base-NER")
    manager.load_model()
    
    sample_text = "I have 5 years of experience with Python, JavaScript, and Docker in AWS."
    entities = manager.extract_entities(sample_text)
    print(f"Test Extraction Complete: {entities}")

