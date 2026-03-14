FROM python:3.11-slim

WORKDIR /app

# Install system deps for scipy/numpy native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Install pulse/sentence-transformers for BERT embeddings
RUN pip install --no-cache-dir sentence-transformers pulp scikit-learn

# Copy source code
COPY . .

EXPOSE 8001

CMD ["uvicorn", "api:app", "--host", "0.0.0.0", "--port", "8001"]
