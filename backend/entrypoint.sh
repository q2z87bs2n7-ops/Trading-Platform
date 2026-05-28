#!/bin/sh
# Boots the FXCM FCLite Java bridge (background) + FastAPI uvicorn (foreground)
# inside the same Render container. The FastAPI proxy talks to the bridge on
# 127.0.0.1:3001, so the bridge stays bound to localhost. If the bridge dies,
# /api/fxcm/* returns 503 — the existing client-side offline path handles it.
#
# -Djdk.net.hosts.file replaces the JVM resolver entirely (not additive); all
# FXCM hostnames must live in /app/jvm-hosts.txt. Works identically on Linux
# and Windows — see docs/fxcm.md.

set -e

cleanup() {
  [ -n "$BRIDGE_PID" ] && kill -TERM "$BRIDGE_PID" 2>/dev/null || true
  [ -n "$UVI_PID" ]    && kill -TERM "$UVI_PID"    2>/dev/null || true
  wait 2>/dev/null || true
  exit 0
}
trap cleanup INT TERM

java -Djdk.net.hosts.file=/app/jvm-hosts.txt \
     -jar /app/fxcm-bridge.jar &
BRIDGE_PID=$!

uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" &
UVI_PID=$!

# Exit when either process exits, so Render restarts the container.
# kill -0 is portable across sh/dash/bash; `wait -n` is bash-only and the
# python:3.12-slim image's /bin/sh is dash.
while kill -0 "$BRIDGE_PID" 2>/dev/null && kill -0 "$UVI_PID" 2>/dev/null; do
  sleep 5
done
cleanup
