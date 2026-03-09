# SQL Database Schema

This document corresponds to Phase 1.2.1 and defines the foundational structured entities, user states, and learning resources.

## 1. Users Table
Handles user identity, target state, and optimization constraints.
- Identifiers: `user_id` (UUID), `firebase_uid`.
- Data: `email`, `current_skills_json` (dynamic skill vector), `target_role`.
- Constraints: `budget_usd`, `time_cap_hours`.

## 2. Skills Table
The canonical skill ontology.
- Identifiers: `skill_id`.
- Data: `canonical_name`, `category`.
- Algorithm properties: `demand_weight` (TF-IDF weighted by market demand).

## 3. Learning Resources Table
The catalog of available courses, certs, projects, and books.
- Identifiers: `resource_id`.
- Data: `title`, `provider`, `url`.
- Categorical: `resource_type`, `difficulty_level`.
- Edges: `primary_skill_id` (foreign key to skills).
- Costs: `cost_usd`, `duration_hours`.

## 4. Job Roles Table
Represents established industry roles.
- Identifiers: `role_id`.
- Data: `role_name`, `required_skills_json`.
- Machine Learning properties: `cluster_id` (from DBSCAN analysis).
