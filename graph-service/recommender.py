import os
import logging
import pandas as pd
from neo4j import GraphDatabase
from dotenv import load_dotenv

# For Collaborative Filtering Mockup
from surprise import Dataset, Reader, SVD
from surprise.model_selection import train_test_split
from surprise import accuracy

logging.basicConfig(level=logging.INFO, format='%(asctime)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

class RecommenderService:
    def __init__(self):
        load_dotenv()
        self.neo4j_uri = os.getenv("NEO4J_URI", "bolt://localhost:7687")
        self.neo4j_user = os.getenv("NEO4J_USER", "neo4j")
        self.neo4j_password = os.getenv("NEO4J_PASSWORD", "password")
        self.neo_driver = GraphDatabase.driver(self.neo4j_uri, auth=(self.neo4j_user, self.neo4j_password))
        
        # 4.2.2 Collaborative Filtering Variables
        self.cf_model = None
        
    def close(self):
        self.neo_driver.close()

    # --- 4.2.1 Content-Based Filtering ---
    def content_based_recommendation(self, missing_skills, limit=5):
        """
        Recommends resources based on the user's missing skills. 
        Ranks by market demand_weight (from the target skill).
        """
        logger.info(f"Generating Content-Based recommendations for missing skills: {missing_skills}")
        
        query = """
        UNWIND $missing_skills AS missing_skill
        MATCH (s1:Skill)-[r:LEARN_VIA]->(s2:Skill {name: missing_skill})
        RETURN s2.name AS target_skill, r.title AS course_title, r.cost AS cost, r.time AS hours, r.demand_weight AS relevance
        ORDER BY r.demand_weight DESC, r.cost ASC
        LIMIT $limit
        """
        
        with self.neo_driver.session() as session:
            result = session.run(query, missing_skills=missing_skills, limit=limit)
            recommendations = []
            for record in result:
                recommendations.append({
                    "target_skill": record["target_skill"],
                    "course_title": record["course_title"],
                    "cost": record["cost"],
                    "hours": record["hours"],
                    "relevance_score": record["relevance"]
                })
                
        return recommendations


    # --- 4.2.2 Collaborative Filtering Mockup ---
    def train_collaborative_mockup(self):
        """Builds a Matrix Factorization (SVD) model on mock user data."""
        logger.info("Training Collaborative Filtering Mockup (SVD)...")
        
        # 1. Create Mock User-Resource Interaction Data
        # User ID, Resource Title, Rating (1-5)
        mock_data = {
            'user_id': [1, 1, 1, 2, 2, 3, 3, 4, 4, 5],
            'resource': [
                'Python for Everybody Specialization', 'Machine Learning Specialization', 'Neural Networks and Deep Learning',
                'Python for Everybody Specialization', 'Intro to SQL',
                'Machine Learning Specialization', 'Neural Networks and Deep Learning',
                'Intro to SQL', 'PostgreSQL Basics',
                'React Native Basics'
            ],
            'rating': [5, 4, 4, 5, 3, 4, 5, 4, 5, 5]
        }
        df = pd.DataFrame(mock_data)
        
        # 2. Train the Model
        reader = Reader(rating_scale=(1, 5))
        data = Dataset.load_from_df(df[['user_id', 'resource', 'rating']], reader)
        
        trainset, testset = train_test_split(data, test_size=0.2, random_state=42)
        
        self.cf_model = SVD()
        self.cf_model.fit(trainset)
        
        predictions = self.cf_model.test(testset)
        rmse = accuracy.rmse(predictions, verbose=False)
        logger.info(f"Mockup Collaborative Filtering Model trained. RMSE: {rmse:.4f}")
        
    def collaborative_recommendation(self, user_id, potential_resources):
        """Predicts the rating a user would give to potential resources."""
        if not self.cf_model:
            logger.error("Collaborative model not trained.")
            return []
            
        logger.info(f"Predicting ratings for User {user_id}...")
        predictions = []
        for resource in potential_resources:
            # Predict
            pred = self.cf_model.predict(user_id, resource)
            predictions.append({
                "resource": resource,
                "predicted_rating": pred.est
            })
            
        # Sort by highest predicted rating
        predictions.sort(key=lambda x: x["predicted_rating"], reverse=True)
        return predictions


if __name__ == "__main__":
    recommender = RecommenderService()
    
    # Test 4.2.1: Content-Based
    print("\n--- CONTENT-BASED RECOMMENDATIONS ---")
    my_missing_skills = ["Machine Learning", "PostgreSQL"]
    cb_recs = recommender.content_based_recommendation(my_missing_skills)
    for r in cb_recs:
        print(f"Goal: {r['target_skill']} | Rank: {r['relevance_score']} | Course: {r['course_title']} (${r['cost']} / {r['hours']}h)")
        
    # Test 4.2.2: Collaborative Mockup
    print("\n--- COLLABORATIVE FILTERING RECOMMENDATIONS (User 1) ---")
    recommender.train_collaborative_mockup()
    # Assume User 1 hasn't taken these yet
    unseen = ["Intro to SQL", "PostgreSQL Basics", "React Native Basics"]
    cf_recs = recommender.collaborative_recommendation(user_id=1, potential_resources=unseen)
    for r in cf_recs:
        print(f"Course: {r['resource']} | Predicted Rating: {r['predicted_rating']:.2f} / 5.0")
        
    recommender.close()
