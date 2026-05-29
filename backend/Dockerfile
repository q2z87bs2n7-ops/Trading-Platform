# Persistent host for the real-time quote relay (FastAPI + uvicorn).
# Vercel's serverless functions can't hold the Alpaca WebSocket open, so
# /api/stream needs this always-on process. The FXCM FCLite bridge used to
# co-live here; it now runs as its own Render service (see fxcm-bridge/Dockerfile
# + render.yaml) and the relay reaches it over the private network via
# FXCM_BRIDGE_URL. This image is Python-only — no JVM.

FROM python:3.12-slim

# Build context is the repo ROOT (see render.yaml dockerContext) so the image
# can ship the root VERSION file that app/main.py reads at startup.
WORKDIR /app

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY VERSION ./VERSION
COPY backend/entrypoint.sh /app/entrypoint.sh
RUN chmod +x /app/entrypoint.sh

ENV PORT=8000
EXPOSE 8000

# Single worker: the QuoteHub keeps one shared Alpaca stream per process —
# never scale workers without an external pub/sub layer.
CMD ["/app/entrypoint.sh"]
