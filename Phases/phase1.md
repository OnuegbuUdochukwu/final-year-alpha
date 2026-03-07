# 1️⃣ Decomposed Phase 1: Project Initiation and Infrastructure Setup

This phase is broken down into 12 granular, actionable tasks to establish the necessary development and data infrastructure before core feature development begins.

## 1.1.1 Repository Initialization and Branching
- **Purpose**: Establish core version control and collaboration standards.
- **Detailed Steps**: Initialize Git, define the main branch, and create initial develop and feature templates (e.g., GitFlow).
- **Tools/Technologies**: `Git`, `GitHub/GitLab`
- **Expected Output**: Initialized repository, documented branching strategy (README.md).

## 1.1.2 Microservice Directory Structuring
- **Purpose**: Define the code organization for the multi-service architecture.
- **Detailed Steps**: Create root directories for: frontend/, api-gateway/, nlp-service/, graph-service/, and data-pipeline/.
- **Tools/Technologies**: `VS Code`, `File System`
- **Expected Output**: Organized, empty directory structure reflecting the microservice design.

## 1.1.3 Cloud Environment Provisioning (Initial)
- **Purpose**: Reserve and configure core cloud compute and networking resources.
- **Detailed Steps**: Set up a Virtual Private Cloud (VPC), configure initial security groups, and provision a basic, small VM instance for testing.
- **Tools/Technologies**: `AWS/GCP/Azure (Terraform/Cloud Console)`
- **Expected Output**: Initial cloud environment provisioned, VPC and subnet established.

## 1.1.4 Project Management Tool Setup
- **Purpose**: Create and populate the project backlog for Phase 1.
- **Detailed Steps**: Set up the project in Jira/Trello/Asana and import all decomposed tasks from this document.
- **Tools/Technologies**: `Jira/Trello/Asana`
- **Expected Output**: Populated project board with assigned Phase 1 tasks.

## 1.2.1 SQL Database Schema DDL Implementation
- **Purpose**: Write the Data Definition Language (DDL) for the relational database tables.
- **Detailed Steps**: Write and test the DDL scripts for Users, LearningResources, and JobRoles (as defined in sql_schema.md).
- **Tools/Technologies**: `PostgreSQL`, `DBeaver/PgAdmin`
- **Expected Output**: DDL script file (init_schema.sql) committed and ready for execution.

## 1.2.2 NoSQL Database Schema Definition and Indexing
- **Purpose**: Define the structure and necessary indexes for the raw job document store.
- **Detailed Steps**: Define the field types and create initial indexes (e.g., on job_title and retrieval_date) for the RawJobDescriptions collection.
- **Tools/Technologies**: `MongoDB (Atlas/Compass)`
- **Expected Output**: Documented MongoDB structure and indexing strategy.

## 1.2.3 Database Service Deployment and Connection Test
- **Purpose**: Deploy the managed SQL and NoSQL instances and confirm accessibility.
- **Detailed Steps**: Deploy managed PostgreSQL and MongoDB instances. Configure service accounts and test connectivity from a simple external Python script.
- **Tools/Technologies**: `PostgreSQL (RDS/Cloud SQL)`, `MongoDB (Atlas)`, `Python`
- **Expected Output**: Running database services, confirmed external connection.

## 1.2.4 Initial Mock Data Loading (Resources)
- **Purpose**: Populate the resource catalogue for immediate graph testing.
- **Detailed Steps**: Curate and insert 10 mock learning resource entries into the LearningResources table (including costs, times, and URLs).
- **Tools/Technologies**: `PostgreSQL`, `SQL Insert Scripts`
- **Expected Output**: LearningResources table populated with test data.

## 1.3.1 Job Board API Key Acquisition
- **Purpose**: Secure official credentials for real-time market data access.
- **Detailed Steps**: Apply for developer access or secure scraping credentials for the chosen job board API (e.g., Indeed).
- **Tools/Technologies**: `Job Board API Portal`
- **Expected Output**: Valid API key/credentials stored securely in a password manager.

## 1.3.2 Data Ingestion Script Development (Core Logic)
- **Purpose**: Write the initial Python script to handle API requests and JSON response parsing.
- **Detailed Steps**: Develop the Python script that structures the API request, handles the response, and extracts the core fields (job_title, raw_description_text, etc.).
- **Tools/Technologies**: `Python`, `requests`
- **Expected Output**: Functional Python script for fetching job data from the API.

## 1.3.3 MongoDB Ingestion and Validation
- **Purpose**: Execute the POC script and verify data integrity in the NoSQL database.
- **Detailed Steps**: Run the script (1.3.2) to fetch 100 sample job descriptions and save them to the RawJobDescriptions collection. Manually verify 5 random entries.
- **Tools/Technologies**: `Python`, `MongoDB Driver`
- **Expected Output**: 100 successfully stored, validated raw job documents in MongoDB.

## 1.3.4 Rate Limit and Error Handling Logic
- **Purpose**: Implement basic robustness for the API access layer.
- **Detailed Steps**: Add basic try-except blocks and exponential backoff retry logic to handle API rate limits and connection errors in the ingestion script.
- **Tools/Technologies**: `Python`, `time module`
- **Expected Output**: Robust data ingestion script prototype.

## Completion Checklist

- [x] 1.1.1 Repository Initialization and Branching
- [x] 1.1.2 Microservice Directory Structuring
- [ ] 1.1.3 Cloud Environment Provisioning (Initial)
- [ ] 1.1.4 Project Management Tool Setup
- [ ] 1.2.1 SQL Database Schema DDL Implementation
- [ ] 1.2.2 NoSQL Database Schema Definition and Indexing
- [ ] 1.2.3 Database Service Deployment and Connection Test
- [ ] 1.2.4 Initial Mock Data Loading (Resources)
- [ ] 1.3.1 Job Board API Key Acquisition
- [ ] 1.3.2 Data Ingestion Script Development (Core Logic)
- [ ] 1.3.3 MongoDB Ingestion and Validation
- [ ] 1.3.4 Rate Limit and Error Handling Logic
