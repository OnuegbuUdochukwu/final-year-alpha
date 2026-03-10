import os
import logging
import pandas as pd
from pymongo import MongoClient
import psycopg2
from sklearn.feature_extraction.text import TfidfVectorizer, CountVectorizer
from dotenv import load_dotenv

# We need the normalizer from the nlp-service to ensure we calculate weights for canonical terms
import sys
sys.path.append(os.path.join(os.path.dirname(__file__), '..', 'nlp-service'))
from normalizer import SkillNormalizer

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(name)s - %(message)s')
logger = logging.getLogger(__name__)

class MarketDemandCalculator:
    """Analyzes all job descriptions to assign a TF-IDF weight to canonical skills."""
    def __init__(self):
        load_dotenv()
        self.mongo_url = os.getenv("MONGODB_URL")
        self.pg_url = os.getenv("SUPABASE_PG_URL")
        
        if not self.mongo_url or not self.pg_url:
            raise ValueError("Database credentials missing from .env")
            
        self.normalizer = SkillNormalizer()
        self.canonical_skills = self.normalizer.canonical_list

    def fetch_corpus(self):
        """Fetches all raw text from MongoDB to form the document corpus."""
        logger.info("Connecting to MongoDB to fetch job descriptions...")
        client = MongoClient(self.mongo_url)
        db = client['JobData']
        collection = db.RawJobDescriptions
        
        # In a real heavy system we'd process in chunks, but for 100-20k docs this fits in RAM
        docs = list(collection.find({"processing_status": "pending"}, {"raw_text": 1, "_id": 0}))
        corpus = [doc.get("raw_text", "") for doc in docs if "raw_text" in doc]
        logger.info(f"Fetched {len(corpus)} documents for analysis.")
        return corpus

    def calculate_weights(self, corpus):
        """
        1. Keyword Frequency Analysis (2.2.1)
        2. TF-IDF Weight Calculation (2.2.2)
        """
        if not corpus:
            logger.warning("Empty corpus, skipping calculation.")
            return {}

        logger.info("Initializing Vectorizer on canonical skills...")
        # We only want to fit the TfidfVectorizer on our known canonical skill vocabulary
        # to find out how important *they* are, ignoring random adjectives.
        # We lowercase everything to match standard text processing
        vocab = [s.lower() for s in self.canonical_skills]
        
        # TF-IDF Vectorizer
        vectorizer = TfidfVectorizer(vocabulary=vocab, stop_words='english', lowercase=True)
        tfidf_matrix = vectorizer.fit_transform(corpus)
        
        # Sum the TF-IDF scores for each term across all documents
        # This gives a "global importance" weight
        summed_tfidf = tfidf_matrix.sum(axis=0)
        
        scores = {}
        for col, term in enumerate(vocab):
            score = summed_tfidf[0, col]
            # Map back to the exact canonical capitalization internally
            # Find the original canonical string that generated this lowercased term
            original_term = next(s for s in self.canonical_skills if s.lower() == term)
            scores[original_term] = float(score)

        # Normalize the scores to be between 0 and 1.0 (to fit the SQL schema)
        max_score = max(scores.values()) if scores.values() else 1.0
        if max_score > 0:
            for k in scores:
                scores[k] = round((scores[k] / max_score), 4)

        logger.info("Calculations complete.")
        return scores

    def update_sql_weights(self, skill_weights: dict):
        """Pushes the updated weights to the Supabase SQL 'skills' table."""
        logger.info("Connecting to Supabase PostgreSQL...")
        try:
            conn = psycopg2.connect(self.pg_url)
            cursor = conn.cursor()
            
            # Using execute_batch for faster upserts
            from psycopg2.extras import execute_batch
            
            update_query = """
                INSERT INTO skills (canonical_name, category, demand_weight)
                VALUES (%s, 'Auto-Ingested', %s)
                ON CONFLICT (canonical_name) 
                DO UPDATE SET 
                    demand_weight = EXCLUDED.demand_weight;
            """
            
            # Prepare data
            data = [(skill, weight) for skill, weight in skill_weights.items()]
            
            # Execute
            execute_batch(cursor, update_query, data)
            conn.commit()
            
            cursor.close()
            conn.close()
            logger.info(f"Successfully updated/inserted {len(data)} skills into Supabase.")
            
        except Exception as e:
            logger.error(f"Failed to update SQL database: {e}")
            raise

    def run_pipeline(self):
        corpus = self.fetch_corpus()
        weights = self.calculate_weights(corpus)
        
        if weights:
            logger.info(f"Top 5 most weighted skills in this batch:")
            sorted_weights = sorted(weights.items(), key=lambda item: item[1], reverse=True)
            for skill, w in sorted_weights[:5]:
                logger.info(f"  - {skill}: {w}")
                
            self.update_sql_weights(weights)

if __name__ == "__main__":
    calculator = MarketDemandCalculator()
    calculator.run_pipeline()
