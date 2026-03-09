-- Enable UUID extension for secure identifiers
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 1. Users Table
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    firebase_uid VARCHAR(128) UNIQUE NOT NULL,
    email VARCHAR(255) UNIQUE NOT NULL,
    current_skills_json JSONB NOT NULL DEFAULT '{}',
    target_role VARCHAR(255),
    budget_usd NUMERIC(10, 2) DEFAULT 0.00,
    time_cap_hours INTEGER DEFAULT 0,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- 2. Skills Table (Canonical Ontology)
CREATE TABLE skills (
    skill_id SERIAL PRIMARY KEY,
    canonical_name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50), -- e.g., 'Programming', 'Cloud', 'Soft Skill'
    demand_weight NUMERIC(5, 4) DEFAULT 0.0000 -- Populated by Phase 2.2
);

-- 3. Learning Resources Table
CREATE TABLE learning_resources (
    resource_id SERIAL PRIMARY KEY,
    title VARCHAR(255) NOT NULL,
    provider VARCHAR(100), -- e.g., 'Coursera', 'Udemy'
    resource_type VARCHAR(50) CHECK (resource_type IN ('course', 'certification', 'project', 'book')),
    cost_usd NUMERIC(10, 2) NOT NULL,
    duration_hours INTEGER NOT NULL,
    url TEXT UNIQUE NOT NULL,
    primary_skill_id INTEGER REFERENCES skills(skill_id),
    difficulty_level VARCHAR(20) CHECK (difficulty_level IN ('beginner', 'intermediate', 'advanced'))
);

-- 4. Job Roles Table (Cluster Definitions)
CREATE TABLE job_roles (
    role_id SERIAL PRIMARY KEY,
    role_name VARCHAR(255) UNIQUE NOT NULL,
    cluster_id INTEGER,
    required_skills_json JSONB NOT NULL -- Idealized skill vector
);
