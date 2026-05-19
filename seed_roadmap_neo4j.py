import os
import json
import datetime
from dotenv import load_dotenv
from neo4j import GraphDatabase

# Load environment variables from .env
load_dotenv()

# Database credentials
NEO4J_URI = os.getenv("NEO4J_URI", "bolt://localhost:7687")
NEO4J_USER = os.getenv("NEO4J_USERNAME", "neo4j")
NEO4J_PASSWORD = os.getenv("NEO4J_PASSWORD", "password")

# Roles to extract and seed
TARGET_ROLES = [
    "frontend", 
    "backend", 
    "devops", 
    "full-stack", 
    "data-analyst", 
    "cyber-security", 
    "android"
]

def process_roadmaps():
    print(f"Connecting to Neo4j at {NEO4J_URI}...")
    try:
        driver = GraphDatabase.driver(NEO4J_URI, auth=(NEO4J_USER, NEO4J_PASSWORD))
        # Test connection
        driver.verify_connectivity()
    except Exception as e:
        print(f"Failed to connect to Neo4j: {e}")
        return

    base_dir = "./developer-roadmap-master/src/data/roadmaps/"
    
    for role in TARGET_ROLES:
        role_dir = os.path.join(base_dir, role)
        json_file = os.path.join(role_dir, f"{role}.json")
        
        if not os.path.exists(json_file):
            print(f"Skipping {role}: File {json_file} not found.")
            continue
            
        print(f"Processing role: {role}")
        
        try:
            with open(json_file, 'r', encoding='utf-8') as f:
                data = json.load(f)
        except Exception as e:
            print(f"  - Error reading {json_file}: {e}")
            continue
            
        nodes = data.get("nodes", [])
        edges = data.get("edges", [])
        
        # 1. Extract Valid Nodes
        valid_nodes = {}
        for node in nodes:
            label = node.get("data", {}).get("label")
            # Only process if label is a valid, non-empty string
            if label and isinstance(label, str) and label.strip():
                valid_nodes[node["id"]] = label.strip()
                
        # 2. Push Nodes and Edges to Neo4j
        edge_count = 0
        with driver.session() as session:
            # Load Nodes
            for node_id, label in valid_nodes.items():
                if label.lower() == "vertical node" or label.lower() == "horizontal node":
                    continue
                try:
                    session.run(
                        "MERGE (s:Skill {id: $id, role: $role}) ON CREATE SET s.name = $name",
                        id=node_id, role=role, name=label
                    )
                except Exception as e:
                    if "ConstraintValidationFailed" in str(e):
                        print(f"    - Skipping duplicate name constraint for: {label}")
                    else:
                        print(f"    - Error creating node {label}: {e}")
                
            # Load Edges
            for edge in edges:
                source = edge.get("source")
                target = edge.get("target")
                
                # Safety Check: only create edge if BOTH source and target exist in valid nodes
                if source in valid_nodes and target in valid_nodes:
                    session.run(
                        "MATCH (source:Skill {id: $source_id, role: $role}) "
                        "MATCH (target:Skill {id: $target_id, role: $role}) "
                        "MERGE (source)-[:REQUIRES]->(target)",
                        source_id=source, target_id=target, role=role
                    )
                    edge_count += 1
                    
        print(f"  - Nodes extracted: {len(valid_nodes)}")
        print(f"  - Edges linked: {edge_count}")
        
    driver.close()
    
    current_time = datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    print(f"Seeding finished successfully at {current_time}.")

if __name__ == "__main__":
    process_roadmaps()
