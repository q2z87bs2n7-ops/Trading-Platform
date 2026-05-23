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

from . import coingecko, db, fmp
from .alpaca.trading import get_all_assets_for_seed

_log = logging.getLogger(__name__)


def enrich_stocks(
    symbols: list[str] | None = None,
    limit: int = 0,
    force: bool = False,
) -> dict:
    """Enrich us_equity rows from FMP (single-symbol). Either an explicit
    ``symbols`` list, or — when ``limit`` is given — the next ``limit``
    un-enriched stocks (options-listed first). Skips already-enriched unless
    ``force``."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}
    if not fmp.configured():
        return {"error": "FMP_API_KEY not configured"}

    if not symbols and limit > 0:
        symbols = db.unenriched_stock_symbols(limit)
    symbols = symbols or []
    if not symbols:
        return {"error": "pass symbols=... or limit=N"}

    t0 = time.monotonic()
    already = set() if force else db.enriched_stock_symbols()
    enriched = skipped = not_found = failed = 0

    for sym in symbols:
        if sym in already:
            skipped += 1
            continue
        try:
            data = fmp.fetch_profile(sym)
            if not data:
                _log.info("enrich-stocks: no FMP profile for %s", sym)
                not_found += 1
                continue
            db.upsert_stock_enrichment(fmp.map_stock_enrichment(sym, data))
            enriched += 1
            _log.info("enrich-stocks: enriched %s", sym)
        except Exception as exc:
            _log.warning("enrich-stocks: FMP failed for %s: %s", sym, exc)
            failed += 1
        time.sleep(fmp.CALL_DELAY)

    return {
        "requested":        len(symbols),
        "stocks_enriched":  enriched,
        "stocks_already":   skipped,
        "stocks_not_found": not_found,
        "stocks_failed":    failed,
        "duration_seconds": round(time.monotonic() - t0, 1),
    }


def run_seed(force: bool = False, base: bool = True) -> dict:
    """Seed the catalogue. By default crypto rows already enriched are skipped
    so a re-run only fills gaps; ``force=True`` re-enriches every crypto pair.
    ``base=False`` skips the slow full Alpaca base upsert and only (re)enriches
    crypto from the rows already in the catalogue."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}

    t0 = time.monotonic()
    seeded = 0

    if base:
        _log.info("seed: fetching all Alpaca assets")
        assets = get_all_assets_for_seed()
        _log.info("seed: fetched %d assets", len(assets))
        seeded = db.bulk_upsert_assets(assets)
        _log.info("seed: upserted %d rows", seeded)
        crypto_syms = sorted(a["symbol"] for a in assets if a["asset_class"] == "crypto")
    else:
        crypto_syms = sorted(db.crypto_symbols())
        _log.info("seed: base skipped; enriching %d crypto rows from DB", len(crypto_syms))

    already_enriched = set() if force else db.enriched_crypto_symbols()
    enriched = skipped = failed = resumed = 0
    delay = coingecko.call_delay()
    profile_cache: dict[str, dict] = {}  # cg_id → CoinGecko payload (many pairs share a coin)

    for symbol in crypto_syms:
        if symbol in already_enriched:
            resumed += 1
            continue
        cg_id = coingecko.coingecko_id_for(symbol)
        if not cg_id:
            _log.info("seed: no CoinGecko mapping for %s, skipping", symbol)
            skipped += 1
            continue
        try:
            data = profile_cache.get(cg_id)
            if data is None:
                data = coingecko.fetch_coin_profile(cg_id)
                profile_cache[cg_id] = data
                time.sleep(delay)
            db.upsert_asset_enrichment(coingecko.map_coin_enrichment(symbol, data))
            enriched += 1
            _log.info("seed: enriched %s", symbol)
        except Exception as exc:
            _log.warning("seed: CoinGecko failed for %s: %s", symbol, exc)
            failed += 1

    return {
        "seeded":            seeded,
        "crypto_enriched":   enriched,
        "crypto_already":    resumed,
        "crypto_skipped":    skipped,
        "crypto_failed":     failed,
        "duration_seconds":  round(time.monotonic() - t0, 1),
    }
