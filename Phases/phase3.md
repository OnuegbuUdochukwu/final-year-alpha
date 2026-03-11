# 3️⃣ Decomposed Phase 3: Skill Graph and Algorithmic Core

This phase builds the "brain" of the optimizer using graph theory.

## 3.1.1 Neo4j Schema & Constraints
- **Purpose**: Define the structural rules for the graph database.
- **Detailed Steps**: Set up constraints for unique Skill IDs and Role Names. Define the labels: Skill, Role, and Resource.
- **Tools/Technologies**: `Cypher`, `Neo4j`
- **Expected Output**: Enforced schema in the Neo4j instance.

## 3.1.2 SQL-to-Graph ETL
- **Purpose**: Migrate structured skills and roles into the graph format.
- **Detailed Steps**: Write a script to fetch data from PostgreSQL and create nodes and :REQUIRES relationships in Neo4j.
- **Tools/Technologies**: `Python`, `Neo4j Driver`
- **Expected Output**: Graph populated with nodes and prerequisite edges.

## 3.2.1 Resource-to-Edge Mapping
- **Purpose**: Connect learning actions to skill nodes.
- **Detailed Steps**: For every resource in the LearningResources table, create a :LEARN_VIA edge between the prerequisite skill and the target skill.
- **Tools/Technologies**: `Cypher`
- **Expected Output**: Neo4j edges containing properties for cost and time.

## 3.2.2 Weight Normalization Service
- **Purpose**: Calculate the final edge weight ($W$) for pathfinding.
- **Detailed Steps**: Implement the function $W = \alpha(\text{Cost}) + \beta(\text{Time}) + \gamma(1/\text{Relevance})$ to update edge properties.
- **Tools/Technologies**: `Python`
- **Expected Output**: Neo4j edges with a calculated weight property.

## 3.3.1 BERT Embedding Generation
- **Purpose**: Prepare the data for the semantic heuristic.
- **Detailed Steps**: Use sentence-transformers to generate 768-dimension embeddings for every Skill and Role node.
- **Tools/Technologies**: `Python`, `Sentence-BERT`
- **Expected Output**: Embeddings stored as properties on Neo4j nodes.

## 3.3.2 A Algorithm Implementation*
- **Purpose**: Build the pathfinding logic.
- **Detailed Steps**: Implement the A* search in Python, using Cosine Similarity between embeddings as the $h(n)$ (heuristic) function.
- **Tools/Technologies**: `Python`, `NetworkX`
- **Expected Output**: A function that returns a list of Node IDs representing the path.

## 3.3.3 Pathfinder API Wrapper
- **Purpose**: Expose the pathfinding logic to the frontend.
- **Detailed Steps**: Create an endpoint that takes User ID and Target Role, runs the A* search, and returns the path metadata.
- **Tools/Technologies**: `FastAPI`
- **Expected Output**: GET /find-path/{role_id} endpoint.

## Completion Checklist

- [x] 3.1.1 Neo4j Schema & Constraints
- [x] 3.1.2 SQL-to-Graph ETL
- [x] 3.2.1 Resource-to-Edge Mapping
- [ ] 3.2.2 Weight Normalization Service
- [ ] 3.3.1 BERT Embedding Generation
- [ ] 3.3.2 A Algorithm Implementation*
- [ ] 3.3.3 Pathfinder API Wrapper
