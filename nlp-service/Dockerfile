FROM python:3.11-slim

WORKDIR /app

# Copy and install Python dependencies (lightweight – no ML libs)
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy source code
COPY . .

EXPOSE 8000

# Use environment variable for port (Render compatibility)
ENV PORT=8000
CMD ["sh", "-c", "gunicorn -k uvicorn.workers.UvicornWorker api:app --bind 0.0.0.0:$PORT --timeout 120"]
