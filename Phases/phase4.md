# 4️⃣ Decomposed Phase 4: Recommendation and Analytics Systems

This phase refines the path and provides market-driven insights.

## 4.1.1 Word2Vec Job Training
- **Purpose**: Create semantic vectors for job descriptions.
- **Detailed Steps**: Train a Word2Vec model on the preprocessed job descriptions to capture the "context" of roles.
- **Tools/Technologies**: `Gensim`, `Python`
- **Expected Output**: Trained .model file for job vectorization.

## 4.1.2 DBSCAN Cluster Analysis
- **Purpose**: Group similar jobs and identify outliers.
- **Detailed Steps**: Run DBSCAN on the vectors to find dense clusters (established roles) and sparse clusters (emerging trends).
- **Tools/Technologies**: `Scikit-learn`
- **Expected Output**: Cluster ID mapping for all Job Roles in the SQL DB.

## 4.2.1 Content-Based Filter Logic
- **Purpose**: Recommend resources based on specific skill gaps.
- **Detailed Steps**: Rank resources by their demand_weight (from Phase 2) and relevance for the user's missing skills.
- **Tools/Technologies**: `Python`
- **Expected Output**: RecommenderService functional logic.

## 4.2.2 Collaborative Filtering Mockup
- **Purpose**: Prepare for user-based recommendations.
- **Detailed Steps**: Build a simple matrix factorization model using mock user-resource interaction data.
- **Tools/Technologies**: `Scikit-surprise`
- **Expected Output**: A basic recommendation engine ready for real data.

## 4.3.1 LP Problem Formulation
- **Purpose**: Define the objective and constraints for optimization.
- **Detailed Steps**: Use the PuLP library to define the decision variables (include/exclude step) and the budget/time constraints.
- **Tools/Technologies**: `Python`, `PuLP`
- **Expected Output**: An optimization model that takes an A* path and returns a pruned version.

## 4.3.2 Optimization API Integration
- **Purpose**: Combine pathfinding and optimization.
- **Detailed Steps**: Update the Pathfinder API to pass the A* results through the LP solver before returning the response to the user.
- **Tools/Technologies**: `Python`, `FastAPI`
- **Expected Output**: Final optimized roadmap JSON output.

## Completion Checklist

- [x] 4.1.1 Word2Vec Job Training
- [x] 4.1.2 DBSCAN Cluster Analysis
- [x] 4.2.1 Content-Based Filter Logic
- [x] 4.2.2 Collaborative Filtering Mockup
- [x] 4.3.1 LP Problem Formulation
- [x] 4.3.2 Optimization API Integration
