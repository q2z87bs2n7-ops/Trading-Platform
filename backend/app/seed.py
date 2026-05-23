"""One-shot asset catalogue seeder.

Fetches the full Alpaca asset universe (us_equity + crypto, active,
all tradability), bulk-upserts base identity data, then enriches
crypto rows via CoinGecko.

Must be triggered from a host that can reach Supabase :5432 — use the
Render URL, not Vercel: curl -X POST https://<render-url>/api/_dev/seed-assets
"""
from __future__ import annotations

import logging
import time

from . import coingecko, db
from .alpaca.trading import get_all_assets_for_seed

_log = logging.getLogger(__name__)


def run_seed() -> dict:
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}

    t0 = time.monotonic()

    _log.info("seed: fetching all Alpaca assets")
    assets = get_all_assets_for_seed()
    _log.info("seed: fetched %d assets", len(assets))

    seeded = db.bulk_upsert_assets(assets)
    _log.info("seed: upserted %d rows", seeded)

    crypto = [a for a in assets if a["asset_class"] == "crypto"]
    enriched = skipped = failed = 0

    for asset in crypto:
        symbol = asset["symbol"]
        cg_id = coingecko.coingecko_id_for(symbol)
        if not cg_id:
            _log.info("seed: no CoinGecko mapping for %s, skipping", symbol)
            skipped += 1
            continue
        try:
            data = coingecko.fetch_coin_profile(cg_id)
            db.upsert_asset_enrichment(coingecko.map_coin_enrichment(symbol, data))
            enriched += 1
            _log.info("seed: enriched %s", symbol)
        except Exception as exc:
            _log.warning("seed: CoinGecko failed for %s: %s", symbol, exc)
            failed += 1
        time.sleep(coingecko.CALL_DELAY)

    return {
        "seeded":          seeded,
        "crypto_enriched": enriched,
        "crypto_skipped":  skipped,
        "crypto_failed":   failed,
        "duration_seconds": round(time.monotonic() - t0, 1),
    }
