FROM python:3.11-slim

WORKDIR /app

# Install system deps for transformers and PDF parsing
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Download the NLP model at build time to avoid cold-start delays
RUN python -c "from transformers import pipeline; pipeline('ner', model='distilbert-base-uncased')" || true

# Copy source code
COPY . .

EXPOSE 8000

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8000"]
