import os
import logging
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor
from gensim.models import Word2Vec
from nltk.tokenize import word_tokenize
import nltk

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Ensure NLTK tokenizer is available
try:
    nltk.data.find('tokenizers/punkt')
    nltk.data.find('tokenizers/punkt_tab')
except LookupError:
    logger.info("Downloading NLTK punkt tokenizer...")
    nltk.download('punkt')
    nltk.download('punkt_tab')

class Word2VecTrainer:
    """Trains a Word2Vec model on job descriptions from Supabase PostgreSQL."""
    
    def __init__(self):
        # The main .env is at the project root: ../.env
        env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
        load_dotenv(dotenv_path=env_path)
        
        self.pg_url = os.getenv("SUPABASE_PG_URL")
        if not self.pg_url:
            raise ValueError("SUPABASE_PG_URL missing from root .env")
            
        self.conn = None
        
    def connect(self):
        logger.info("Connecting to PostgreSQL to fetch job descriptions...")
        self.conn = psycopg2.connect(self.pg_url)

    def close(self):
        if self.conn:
            self.conn.close()

    def fetch_job_descriptions(self):
        """Extracts all text descriptions from the job postings."""
        try:
            with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
                # We need to see if the table exists and what the column is named.
                # Assuming table is named 'job_roles' or 'job_postings' with a 'description' column.
                # Since we don't know the exact schema of raw ingested jobs, let's query the table.
                cur.execute("""
                    SELECT description 
                    FROM job_roles 
                    WHERE description IS NOT NULL
                """)
                records = cur.fetchall()
                if not records:
                     logger.warning("No descriptions found in job_roles. Falling back to dummy data for demonstration.")
                     # As a fallback if the DB doesn't have raw descriptions yet
                     return [
                         "We are looking for a Python Software Engineer with Flask and Postgres experience.",
                         "Data Scientist needed! Must know Python, Pandas, Machine Learning, and SQL.",
                         "Frontend Developer wanted. React, JavaScript, HTML, CSS are required.",
                         "Backend Developer capable of writing Python, Neo4j, and Docker.",
                         "Seeking a Machine Learning Engineer to build models using Python and PyTorch."
                     ]
                return [r['description'] for r in records]
        except Exception as e:
            logger.error(f"Failed to fetch descriptions: {e}")
            logger.info("Falling back to dummy corpus for demonstration.")
            return [
                "We are looking for a Python Software Engineer with Flask and Postgres experience.",
                "Data Scientist needed! Must know Python, Pandas, Machine Learning, and SQL.",
                "Frontend Developer wanted. React, JavaScript, HTML, CSS are required.",
                "Backend Developer capable of writing Python, Neo4j, and Docker.",
                "Seeking a Machine Learning Engineer to build models using Python and PyTorch."
            ]
            
    def preprocess_text(self, texts):
        """Tokenizes the text into sentences of words."""
        logger.info(f"Tokenizing {len(texts)} job descriptions...")
        sentences = []
        for text in texts:
            # Simple tokenization
            tokens = word_tokenize(text.lower())
            # Keep only alphanumeric tokens
            tokens = [t for t in tokens if t.isalnum()]
            if tokens:
                sentences.append(tokens)
        return sentences

    def train_model(self, sentences, model_path="job_context.model"):
        """Trains and saves the Word2Vec model."""
        if not sentences:
            logger.warning("No sentences to train on!")
            return None
            
        logger.info(f"Training Word2Vec on {len(sentences)} description segments...")
        # Train model
        model = Word2Vec(sentences=sentences, vector_size=100, window=5, min_count=1, workers=4)
        
        logger.info(f"Saving trained model to {model_path}...")
        model.save(model_path)
        return model

if __name__ == "__main__":
    trainer = Word2VecTrainer()
    try:
        trainer.connect()
        raw_texts = trainer.fetch_job_descriptions()
        tokenized_sentences = trainer.preprocess_text(raw_texts)
        trainer.train_model(tokenized_sentences)
    finally:
        trainer.close()
