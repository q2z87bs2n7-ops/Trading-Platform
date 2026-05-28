# FXCM Bridge — FCLite Java

HTTP bridge on port 3001. FastAPI proxies all `/api/fxcm/*` calls here.
Full architecture and SDK patterns in `docs/fxcm.md`.

## Prerequisites

- JDK 8+ (JDK 25 at `C:\jdk25\jdk-25.0.3+9` on dev machine)
- Maven 3.x (`C:\maven\apache-maven-3.9.16` on dev machine)
- `C:\Temp\jvm-hosts.txt` — JVM hosts file with FXCM server IPs (see DNS section in `docs/fxcm.md`)

## Build

```powershell
$env:JAVA_HOME = "C:\jdk25\jdk-25.0.3+9"
$env:Path = "$env:JAVA_HOME\bin;C:\maven\apache-maven-3.9.16\bin;$env:Path"
cd fxcm-bridge\java
mvn package -DskipTests
```

Produces `target\fxcm-bridge-1.0.0.jar` (fat JAR — all deps bundled).

## Run

```powershell
& "C:\jdk25\jdk-25.0.3+9\bin\java.exe" `
    -Djdk.net.hosts.file=C:\Temp\jvm-hosts.txt `
    -jar "C:\Users\cmischel\Trading-Platform\fxcm-bridge\java\target\fxcm-bridge-1.0.0.jar"
```

The `-Djdk.net.hosts.file` flag is required — it redirects `api-demo.fxcm.com`
(no longer in public DNS) to the correct FXCM server IP. Without it the
bridge cannot connect.

Bridge logs `FXCM connected — account D161665432` when ready.

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
| GET | /instruments | All available instruments |
| GET | /history | Price bars (`?instrument=EUR/USD&timeframe=H1&from=2026-01-01&to=2026-05-27`) |
| POST | /order | Place order `{instrument, buy_sell, amount, order_type, rate?, stop?, limit?}` |
| DELETE | /order/{id} | Cancel order |
| POST | /close | Close position `{trade_id, amount?}` |
| GET | /debug | Snapshot counts (dev inspection) |
