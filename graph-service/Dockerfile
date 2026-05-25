FROM python:3.11-slim

WORKDIR /app

# Install system deps for scipy/numpy native extensions
RUN apt-get update && apt-get install -y --no-install-recommends \
    gcc \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy and install Python dependencies
COPY graph-service/requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY graph-service/ .
COPY shared/ ./shared/

EXPOSE 8001

# Use environment variable for port (Render compatibility)
ENV PORT=8001
CMD ["sh", "-c", "uvicorn api:app --host 0.0.0.0 --port $PORT"]
