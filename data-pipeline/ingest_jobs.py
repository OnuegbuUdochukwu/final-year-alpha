import os
import json
import logging
import pandas as pd
from datetime import datetime, timezone
from pymongo import MongoClient, UpdateOne
from dotenv import load_dotenv

# Load environment variables
load_dotenv()

# Configure logging
logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class JobDataSource:
    """Base interface for all data ingestion strategies."""
    def fetch_data(self):
        """Must yield dict objects matching the MongoDB schema."""
        raise NotImplementedError("Subclasses must implement this method")

class KaggleCSVIngestor(JobDataSource):
    """Strategy to ingest jobs from a static Kaggle CSV (Dice Jobs)."""
    def __init__(self, file_path):
        self.file_path = file_path

    def fetch_data(self):
        logger.info(f"Starting CSV ingestion from {self.file_path}")
        try:
            # We use iterator (chunksize) for large files to save memory
            for chunk in pd.read_csv(self.file_path, chunksize=1000):
                for _, row in chunk.iterrows():
                    # Handle potential NaNs gracefully
                    job_title = str(row.get('jobtitle', 'Unknown Title'))
                    company = str(row.get('company', 'Unknown Company'))
                    description = str(row.get('jobdescription', ''))
                    location = str(row.get('joblocation_address', 'Unknown'))
                    
                    if pd.isna(description) or description.strip() == '':
                        continue
                        
                    # Create a unique-enough ID based on Kaggle data
                    external_id = f"dice_{hash(job_title + company + location)}"

                    doc = {
                        "source": "Dice (Kaggle)",
                        "external_id": external_id,
                        "job_title": job_title,
                        "company": company,
                        "location": {
                            "city": location,
                            "is_remote": 'remote' in location.lower() or 'remote' in description.lower()
                        },
                        "raw_text": description,
                        "posted_at": datetime.now(timezone.utc), 
                        "ingested_at": datetime.now(timezone.utc),
                        "processing_status": "pending"
                    }
                    yield doc

        except FileNotFoundError:
            logger.error(f"Dataset not found at {self.file_path}")
            raise
        except Exception as e:
            logger.error(f"Error reading CSV: {e}")
            raise

class IndeedAPIIngestor(JobDataSource):
    """
    SCAFFOLD: Strategy to ingest jobs from Indeed/Adzuna API.
    To be implemented when an API key is available.
    """
    def __init__(self, api_key):
        self.api_key = api_key
        self.base_url = "https://api.adzuna.com/v1/api/jobs/us/search/1"

    def fetch_data(self):
        logger.info("API Scaffold Implementation - Not Active")
        yield from []


class MongoIngestor:
    """Handles pushing documents into MongoDB."""
    def __init__(self, connection_string):
        try:
            self.client = MongoClient(connection_string, serverSelectionTimeoutMS=5000)
            self.client.admin.command('ping')
            self.db = self.client['JobData'] 
            self.collection = self.db.RawJobDescriptions
            logger.info("Successfully connected to MongoDB Atlas.")
            self._ensure_indexes()
        except Exception as e:
            logger.error(f"MongoDB connection failed: {e}")
            raise

    def _ensure_indexes(self):
        logger.info("Ensuring MongoDB indexes exist...")
        self.collection.create_index([("external_id", 1), ("source", 1)], unique=True)
        self.collection.create_index([("processing_status", 1)])
        self.collection.create_index([("ingested_at", -1)])
        self.collection.create_index([("job_title", "text"), ("raw_text", "text")])
        logger.info("Indexes verified.")

    def run(self, data_source: JobDataSource, batch_size=500):
        operations = []
        doc_count = 0
        inserted_count = 0

        logger.info("Beginning data ingestion pipeline...")
        for doc in data_source.fetch_data():
            operations.append(
                UpdateOne(
                    {"external_id": doc["external_id"], "source": doc["source"]},
                    {"$setOnInsert": doc},
                    upsert=True
                )
            )

            if len(operations) >= batch_size:
                result = self.collection.bulk_write(operations)
                inserted_count += result.upserted_count
                doc_count += len(operations)
                logger.info(f"Processed {doc_count} documents... (Inserted new: {inserted_count})")
                operations = []

        if operations:
            result = self.collection.bulk_write(operations)
            inserted_count += result.upserted_count
            doc_count += len(operations)

        logger.info(f"Pipeline complete. Total processed: {doc_count}, Total brand new inserted: {inserted_count}")


if __name__ == "__main__":
    MONGO_URL = os.getenv("MONGODB_URL")
    
    if not MONGO_URL:
        logger.error("MONGODB_URL not found in environment.")
        exit(1)

    mongo_target = MongoIngestor(MONGO_URL)
    csv_file_path = "3 dice_com-job_us_sample.csv" 
    strategy = KaggleCSVIngestor(csv_file_path)

    # Let's limit the bulk push to just a sample first, so we don't accidentally ingest all 60MB in dev
    # We will wrap it in a small testing mechanism
    logger.info("Running a tiny sample of 100 docs for dev verification...")
    # We alter the run function momentarily by subclassing or just writing it here,
    # actually let's just run it! Wait, we don't want to push 20,000 docs yet.
    # I'll modify the script to only push 1000 for our dev test.
    
    # DEV OVERRIDE: Just do 100 docs to verify everything works end to end.
    operations = []
    doc_count = 0
    inserted_count = 0
    logger.info("TEST PIPELINE: Ingesting max 100 jobs for verification.")
    
    for doc in strategy.fetch_data():
        operations.append(
            UpdateOne(
                {"external_id": doc["external_id"], "source": doc["source"]},
                {"$setOnInsert": doc},
                upsert=True
            )
        )
        if len(operations) >= 100:
            break
            
    if operations:
        result = mongo_target.collection.bulk_write(operations)
        inserted_count += result.upserted_count
        doc_count += len(operations)
        
    logger.info(f"TEST Pipeline complete. Processed {doc_count}, inserted {inserted_count}.")

