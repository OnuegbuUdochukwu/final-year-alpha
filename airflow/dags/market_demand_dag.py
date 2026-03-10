import os
from datetime import datetime, timedelta
from airflow import DAG
from airflow.providers.standard.operators.bash import BashOperator

# Get the absolute path to the data-pipeline directory dynamically 
# so the DAG doesn't break if the project is moved
project_root = "/Users/onuegbuudochukwu/Documents/400 Level/FYP/fyp_alpha"
data_pipeline_dir = os.path.join(project_root, "data-pipeline")

default_args = {
    'owner': 'udochukwu',
    'depends_on_past': False,
    'email_on_failure': False, # To be updated in 2.3.2
    'email_on_retry': False,
    'retries': 1,
    'retry_delay': timedelta(minutes=5),
}

with DAG(
    'market_demand_pipeline',
    default_args=default_args,
    description='A simple pipeline to ingest job descriptions and calculate TF-IDF skill weights.',
    schedule=timedelta(days=1), # Run daily (Airflow 3 syntax)
    start_date=datetime(2026, 1, 1),
    catchup=False,
    tags=['nlp', 'fyp'],
) as dag:

    # Task 1: Ingest job descriptions from Kaggle CSV to MongoDB
    ingest_data_task = BashOperator(
        task_id='ingest_kaggle_jobs',
        bash_command=f'cd "{data_pipeline_dir}" && python3 ingest_jobs.py'
    )

    # Task 2: Calculate TF-IDF demand scores and push to Supabase SQL
    calculate_demand_task = BashOperator(
        task_id='calculate_tf_idf_weights',
        bash_command=f'cd "{data_pipeline_dir}" && python3 demand_calculator.py'
    )

    # Define the dependency (Task 1 must succeed before Task 2 runs)
    ingest_data_task >> calculate_demand_task
