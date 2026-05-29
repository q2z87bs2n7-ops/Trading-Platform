# FXCM FCLite Java bridge — its own Render service (was co-located in the relay
# container). Owns the single persistent FCLite session and exposes a small HTTP
# API. Binds 0.0.0.0 so the relay reaches it over Render's private network
# (FXCM_BRIDGE_HOST below); it is a *private* service, not exposed publicly.
# Build context is the repo ROOT (see render.yaml dockerContext).

# ── Stage 1: build the FCLite fat JAR ────────────────────────────────────────
FROM maven:3.9-eclipse-temurin-17 AS jbuild
WORKDIR /build

# Pre-seed the local Maven repo with FCLite — fxcorporate.com serves it from a
# non-standard path layout (com.fxcm.api/ stays dotted, not com/fxcm/api/), so
# Maven can't resolve it via <repository>. curl + install:install-file is the
# clean workaround. All FCLite transitive deps (tyrus, bouncycastle, ...) live
# on Maven Central.
ARG FCLITE_VERSION=1.3.3
ARG FCLITE_BASE=https://fxcorporate.com/public-maven/com.fxcm.api/forex-connect-lite/${FCLITE_VERSION}
RUN curl -fsSL -o /tmp/fcl.jar "${FCLITE_BASE}/forex-connect-lite-${FCLITE_VERSION}.jar" \
 && curl -fsSL -o /tmp/fcl.pom "${FCLITE_BASE}/forex-connect-lite-${FCLITE_VERSION}.pom" \
 && mvn -B install:install-file -Dfile=/tmp/fcl.jar -DpomFile=/tmp/fcl.pom

COPY fxcm-bridge/java/pom.xml ./pom.xml
COPY fxcm-bridge/java/src ./src
RUN mvn -B -f pom.xml package -DskipTests

# ── Stage 2: JRE runtime ─────────────────────────────────────────────────────
FROM eclipse-temurin:21-jre
WORKDIR /app

COPY backend/jvm-hosts.txt /app/jvm-hosts.txt
COPY fxcm-bridge/entrypoint.sh /app/entrypoint.sh
COPY --from=jbuild /build/target/fxcm-bridge-1.0.0.jar /app/fxcm-bridge.jar
RUN chmod +x /app/entrypoint.sh

# 0.0.0.0 so the relay can reach it over the private network (the literal
# default in BridgeServer.java is 127.0.0.1 for co-located/local dev).
ENV FXCM_BRIDGE_HOST=0.0.0.0
ENV FXCM_BRIDGE_PORT=3001
EXPOSE 3001

CMD ["/app/entrypoint.sh"]
