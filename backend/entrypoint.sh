#!/bin/sh
# Boots the FastAPI quote relay (uvicorn). The FXCM FCLite Java bridge used to
# co-run here; it now runs as its own Render service (see fxcm-bridge/Dockerfile
# + render.yaml). The relay reaches it over the private network via
# FXCM_BRIDGE_URL. `exec` so uvicorn is PID 1 and receives Render's SIGTERM.
set -e
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}"
