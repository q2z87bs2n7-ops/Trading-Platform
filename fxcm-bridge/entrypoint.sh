#!/bin/sh
# Launches the FXCM FCLite Java bridge as its own service. Heap tuned for a
# 512MB container — the bridge now has the box to itself (it used to share with
# Python/uvicorn), so 192MB heap + SerialGC leaves comfortable headroom and no
# more OOM contention. -Djdk.net.hosts.file replaces the JVM resolver entirely
# (not additive); all FXCM hostnames must live in jvm-hosts.txt. `exec` so the
# JVM is PID 1 and receives Render's SIGTERM.
set -e
exec java -Djdk.net.hosts.file=/app/jvm-hosts.txt \
     -Xms64m -Xmx192m \
     -XX:MaxMetaspaceSize=96m \
     -XX:ReservedCodeCacheSize=32m \
     -XX:+UseSerialGC \
     -jar /app/fxcm-bridge.jar
