import os
import logging
import psycopg2
from dotenv import load_dotenv
from psycopg2.extras import RealDictCursor
from gensim.models import Word2Vec
from sklearn.cluster import DBSCAN
import numpy as np

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class JobClusterer:
    """Clustering Job Roles based on Word2Vec semantic vectors."""
    
    def __init__(self, model_path="job_context.model"):
        env_path = os.path.join(os.path.dirname(__file__), '..', '.env')
        load_dotenv(dotenv_path=env_path)
        
        self.pg_url = os.getenv("SUPABASE_PG_URL")
        if not self.pg_url:
            raise ValueError("SUPABASE_PG_URL missing from root .env")
            
        self.model_path = model_path
        self.conn = None
        self.w2v_model = None

    def connect(self):
        logger.info("Connecting to PostgreSQL...")
        self.conn = psycopg2.connect(self.pg_url)
        
    def load_model(self):
        logger.info(f"Loading Word2Vec model from {self.model_path}...")
        self.w2v_model = Word2Vec.load(self.model_path)

    def close(self):
        if self.conn:
            self.conn.close()

    def _get_average_vector(self, text):
        """Calculates the average Word2Vec vector for a given job title/description."""
        words = text.lower().split()
        vectors = [self.w2v_model.wv[word] for word in words if word in self.w2v_model.wv]
        if not vectors:
            # If no words are in the vocabulary, return a zero vector
            return np.zeros(self.w2v_model.vector_size)
        return np.mean(vectors, axis=0)

    def process_and_cluster(self):
        """Fetches roles, computes average embeddings, runs DBSCAN, and updates the database."""
        if not self.w2v_model:
            logger.error("Word2Vec model not loaded!")
            return
            
        with self.conn.cursor(cursor_factory=RealDictCursor) as cur:
            # Fetch all roles
            logger.info("Fetching job roles from database...")
            cur.execute("SELECT role_id, role_name FROM job_roles")
            roles = cur.fetchall()
            
            if not roles:
                logger.warning("No job roles found to cluster.")
                return
                
            logger.info(f"Found {len(roles)} roles. Calculating semantic embeddings...")
            
            role_ids = []
            X = []
            
            for role in roles:
                role_ids.append(role['role_id'])
                # We use the role_name to get its average semantic vector
                vec = self._get_average_vector(role['role_name'])
                X.append(vec)
                
            X = np.array(X)
            
            # Run DBSCAN
            # eps (epsilon): The maximum distance between two samples for one to be considered as in the neighborhood of the other.
            # min_samples: The number of samples in a neighborhood for a point to be considered as a core point.
            logger.info("Running DBSCAN clustering algorithm...")
            db = DBSCAN(eps=2.0, min_samples=2, metric='euclidean').fit(X)
            labels = db.labels_
            
            # Number of clusters in labels, ignoring noise if present (-1)
            n_clusters_ = len(set(labels)) - (1 if -1 in labels else 0)
            n_noise_ = list(labels).count(-1)
            logger.info(f"DBSCAN found {n_clusters_} clusters and {n_noise_} noise points.")
            
            # Update the database
            logger.info("Updating the database with cluster_ids...")
            update_query = "UPDATE job_roles SET cluster_id = %s WHERE role_id = %s"
            
            # Batch update
            update_data = [(int(label), role_id) for label, role_id in zip(labels, role_ids)]
            cur.executemany(update_query, update_data)
            
            # Commit the transaction
            self.conn.commit()
            logger.info(f"Successfully updated cluster_id for {len(update_data)} job roles.")

if __name__ == "__main__":
    clusterer = JobClusterer()
    try:
        clusterer.connect()
        # Verify job_roles has a cluster_id column
        with clusterer.conn.cursor() as cur:
             cur.execute("""
                 ALTER TABLE job_roles 
                 ADD COLUMN IF NOT EXISTS cluster_id INTEGER;
             """)
             clusterer.conn.commit()
        
        clusterer.load_model()
        clusterer.process_and_cluster()
    except Exception as e:
        logger.error(f"Clustering failed: {e}")
    finally:
        clusterer.close()
