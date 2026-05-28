# Persistent host for the real-time quote relay + the FXCM FCLite Java bridge.
# Vercel's serverless functions cannot hold the Alpaca WebSocket open, so
# /api/stream needs an always-on process; the FCLite bridge co-lives in the
# same container because the FastAPI proxy (backend/app/fxcm.py) talks to
# it on 127.0.0.1:3001.

# ── Stage 1: build the FCLite fat JAR ────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-17 AS jbuild
WORKDIR /build
COPY fxcm-bridge/java/pom.xml ./pom.xml
COPY fxcm-bridge/java/src ./src
RUN mvn -B -f pom.xml package -DskipTests

# ── Stage 2: Python runtime + Temurin JRE ────────────────────────────────────
FROM python:3.12-slim

# Build context is the repo ROOT (see render.yaml dockerContext) so the image
# can ship the root VERSION file that app/main.py reads at startup.
WORKDIR /app

RUN apt-get update \
 && apt-get install -y --no-install-recommends openjdk-17-jre-headless \
 && rm -rf /var/lib/apt/lists/*

COPY backend/requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY backend/app ./app
COPY VERSION ./VERSION
COPY backend/jvm-hosts.txt /app/jvm-hosts.txt
COPY backend/entrypoint.sh /app/entrypoint.sh
COPY --from=jbuild /build/target/fxcm-bridge-1.0.0.jar /app/fxcm-bridge.jar
RUN chmod +x /app/entrypoint.sh

ENV PORT=8000
EXPOSE 8000

# Single worker: the QuoteHub keeps one shared Alpaca stream per process,
# and FxcmSession is one persistent FCLite login — never scale workers
# without an external pub/sub layer.
CMD ["/app/entrypoint.sh"]
