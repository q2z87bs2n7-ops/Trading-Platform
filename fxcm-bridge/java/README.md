# FXCM Bridge — FCLite Java

HTTP bridge on port 3001. FastAPI proxies all `/api/fxcm/*` calls here.
Full architecture, FCLite SDK patterns, deploy lessons, and the API
quirks future agents will need: `docs/fxcm.md`.

## Cloud (default)

The bridge is built and run automatically by `backend/Dockerfile` +
`backend/entrypoint.sh` as part of the Render relay. No local action
needed to use the Forex silo from the deployed app.

## Local development

Prerequisites: JDK 8+ (any current Temurin) + Maven 3.x.

### Build

```bash
# FXCM's public-maven repo uses a non-Maven layout — pre-seed local repo:
curl -fsSL -o /tmp/fcl.jar "https://fxcorporate.com/public-maven/com.fxcm.api/forex-connect-lite/1.3.3/forex-connect-lite-1.3.3.jar"
curl -fsSL -o /tmp/fcl.pom "https://fxcorporate.com/public-maven/com.fxcm.api/forex-connect-lite/1.3.3/forex-connect-lite-1.3.3.pom"
mvn install:install-file -Dfile=/tmp/fcl.jar -DpomFile=/tmp/fcl.pom

cd fxcm-bridge/java
mvn package -DskipTests
```

Produces `target/fxcm-bridge-1.0.0.jar` (fat JAR — FCLite + Apache HC5 bundled).

### Run

```bash
java -Djdk.net.hosts.file=/path/to/jvm-hosts.txt \
     -jar fxcm-bridge/java/target/fxcm-bridge-1.0.0.jar
```

`jvm-hosts.txt` content matches `backend/jvm-hosts.txt` (six FXCM server
IPs). The `-Djdk.net.hosts.file` flag is required — it redirects
`api-demo.fxcm.com` (no longer in public DNS) to the correct FXCM IP, and
replaces the JVM's resolver entirely, so every FXCM hostname must be in
the file.

Windows users with admin-restricted shells can use the original tooling
the dev machine ships with (PowerShell `& "C:\jdk25\..\java.exe" ...`).
The flags are identical; only the path syntax differs.

Bridge logs `FXCM connected — account D161665432` when ready, then
`Bridge listening on http://127.0.0.1:3001`.

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Connection status |
| GET | /account | Account balance/equity/margin |
| GET | /prices | Live offers (all or `?instrument=EUR/USD`) |
| GET | /watchlist | Major pairs subset |
| GET | /positions | Open trades |
| GET | /orders | Pending orders |
| GET | /closed_trades | Closed trade history |
| GET | /instruments | All instruments (PascalCase shape; see docs/fxcm.md) |
| GET | /history | Price bars (`?instrument=EUR/USD&timeframe=H1&from=2026-01-01&to=2026-05-27`) |
| POST | /order | Place order `{instrument, buy_sell, amount, order_type, rate?, stop?, limit?}` |
| DELETE | /order/{id} | Cancel order |
| POST | /close | Close position `{trade_id, amount?}` |
| GET | /debug | Snapshot counts (dev inspection) |

Port can be overridden via `FXCM_BRIDGE_PORT` (default 3001). Do not name
the env var `PORT` — Render reserves that for the public-facing process.
