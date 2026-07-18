# InsightFlow AI — backend (FastAPI) image
FROM python:3.12-slim

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PIP_NO_CACHE_DIR=1

WORKDIR /app

# Install dependencies first for better layer caching.
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application source.
COPY app ./app

EXPOSE 8000

# Bind to Railway's injected $PORT (falls back to 8000 locally / on other hosts).
CMD uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
