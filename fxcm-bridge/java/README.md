# FXCM Bridge — Java / FCLite

HTTP bridge on port 3001. FastAPI proxies all `/api/fxcm/*` calls here.

## Prerequisites

- Java 8+ (already installed)
- Maven 3.x — download from https://maven.apache.org/download.cgi
  Extract to e.g. `C:\maven`, add `C:\maven\bin` to PATH.

## Build

```powershell
cd C:\Users\cmischel\Trading-Platform\fxcm-bridge\java
mvn package -DskipTests
```

Produces `target\fxcm-bridge-1.0.0.jar` (fat jar, all deps bundled).

## Run

```powershell
java -jar C:\Users\cmischel\Trading-Platform\fxcm-bridge\java\target\fxcm-bridge-1.0.0.jar
```

## Routes

| Method | Path | Description |
|--------|------|-------------|
| GET | /health | Connection status |
| GET | /account | Account balance/equity |
| GET | /prices | Live offers (all or ?instrument=EUR/USD) |
| GET | /watchlist | Major pairs subset |
| GET | /positions | Open trades |
| GET | /orders | Pending orders |
| GET | /closed_trades | Closed trade history |
| GET | /instruments | All available instruments |
| GET | /history | Price bars (?instrument=EUR/USD&timeframe=H1&from=2026-01-01&to=2026-05-27) |
| POST | /order | Place order `{instrument, buy_sell, amount, order_type, rate?, stop?, limit?}` |
| DELETE | /order/{id} | Cancel order |
| POST | /close | Close position `{trade_id, amount?}` |
| GET | /debug | Snapshot counts for inspection |
