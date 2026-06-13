# Backend image: FastAPI served by uvicorn on port 8000.
FROM python:3.12-slim

WORKDIR /app

# Install dependencies first so this layer is cached across code changes.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application code (data/ and secrets are excluded via .dockerignore;
# the data directory is provided at runtime as a mounted volume).
COPY . .

EXPOSE 8000

# 0.0.0.0 so the server is reachable from outside the container. Shell form so
# $PORT (injected by Render and most PaaS hosts) is honored; locally it's unset,
# so we fall back to 8000 and docker-compose keeps working unchanged.
CMD uvicorn main:app --host 0.0.0.0 --port ${PORT:-8000}
