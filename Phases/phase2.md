# 2️⃣ Decomposed Phase 2: Core Data Processing and NLP Layer

This phase focuses on turning raw text into structured data using Natural Language Processing.

## 2.1.1 PDF/Docx Extraction Pipeline
- **Purpose**: Convert binary documents into clean text strings.
- **Detailed Steps**: Implement a utility class using pdfminer.six and python-docx that strips headers/footers and handles encoding issues.
- **Tools/Technologies**: `Python`, `pdfminer.six`
- **Expected Output**: Text extraction module with 95% accuracy on standard resumes.

## 2.1.2 NER Model Selection & Setup
- **Purpose**: Initialize the Transformer model for entity recognition.
- **Detailed Steps**: Download the distilbert-base-uncased model from Hugging Face and configure the tokenization pipeline.
- **Tools/Technologies**: `Hugging Face`, `Transformers`
- **Expected Output**: Initialized NLP model loader in the nlp-service.

## 2.1.3 Skill Mapping & Normalization
- **Purpose**: Ensure different terms for the same skill map to one ID.
- **Detailed Steps**: Create a fuzzy-matching dictionary (e.g., "JS", "Javascript" -> "JavaScript") using Levenshtein distance or a pre-defined alias list.
- **Tools/Technologies**: `Python`, `FuzzyWuzzy`
- **Expected Output**: A normalization function that maps extracted entities to canonical IDs.

## 2.1.4 Resume Vectorization API
- **Purpose**: Create the endpoint to serve the NLP logic.
- **Detailed Steps**: Build a FastAPI endpoint that accepts a file, runs 2.1.1–2.1.3, and returns a JSON skill vector.
- **Tools/Technologies**: `FastAPI`, `Uvicorn`
- **Expected Output**: POST /parse-resume endpoint.

## 2.2.1 Keyword Frequency Analysis
- **Purpose**: Quantify skill demand from ingested job data.
- **Detailed Steps**: Aggregate all raw_description_text from MongoDB and calculate term frequency across the corpus.
- **Tools/Technologies**: `Pandas`, `Scikit-learn`
- **Expected Output**: Dataframe containing raw counts of skill mentions.

## 2.2.2 TF-IDF Weight Calculation
- **Purpose**: Assign dynamic weights to skills based on market rarity/demand.
- **Detailed Steps**: Apply TF-IDF vectorization to identify skills that are unique and high-demand versus generic filler words.
- **Tools/Technologies**: `Scikit-learn`
- **Expected Output**: Skills table in SQL updated with demand_weight scores.

## 2.3.1 Airflow DAG Construction
- **Purpose**: Orchestrate the data flow from ingestion to extraction.
- **Detailed Steps**: Create a Directed Acyclic Graph (DAG) that triggers the Python ingestion script followed by the Weight Calculation task.
- **Tools/Technologies**: `Apache Airflow`
- **Expected Output**: Working .py DAG file in the Airflow environment.

## 2.3.2 Data Pipeline Monitoring
- **Purpose**: Ensure the scheduled jobs run successfully without silent failures.
- **Detailed Steps**: Integrate Slack or Email alerts into the Airflow DAG for task failures or empty data fetches.
- **Tools/Technologies**: `Airflow Hooks`, `SMTP`
- **Expected Output**: Monitoring dashboard for pipeline health.

## Completion Checklist

- [x] 2.1.1 PDF/Docx Extraction Pipeline
- [x] 2.1.2 NER Model Selection & Setup
- [x] 2.1.3 Skill Mapping & Normalization
- [x] 2.1.4 Resume Vectorization API
- [x] 2.2.1 Keyword Frequency Analysis
- [x] 2.2.2 TF-IDF Weight Calculation
- [ ] 2.3.1 Airflow DAG Construction
- [ ] 2.3.2 Data Pipeline Monitoring
