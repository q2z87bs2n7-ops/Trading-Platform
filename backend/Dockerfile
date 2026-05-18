# Persistent host for the real-time quote relay (Render / Fly / Railway /
# any container host). Vercel's serverless functions cannot hold the
# Alpaca WebSocket open, so /api/stream needs an always-on process.
FROM python:3.12-slim

WORKDIR /app

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY app ./app

ENV PORT=8000
EXPOSE 8000

# Single worker: the QuoteHub keeps one shared Alpaca stream per process,
# so do not scale workers without an external pub/sub layer.
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port ${PORT}"]
