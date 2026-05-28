"""One-shot asset catalogue seeder.

Fetches the full Alpaca asset universe (us_equity + crypto, active,
all tradability), bulk-upserts base identity data, then enriches
crypto rows via CoinGecko.

Must be triggered from a host that can reach Supabase :5432 — use the
Render URL, not Vercel: curl -X POST https://<render-url>/api/_dev/seed-assets
"""
from __future__ import annotations

import logging
import threading
import time

from . import coingecko, db, fmp
from .alpaca.trading import get_all_assets_for_seed

_log = logging.getLogger(__name__)

# Guards the fire-and-forget refresh routines so a second kickoff of the *same*
# routine while one is running returns "already_running" instead of stacking
# threads (different routines can run concurrently).
_bg_lock = threading.Lock()
_bg_running: set[str] = set()


def _start_background(name: str, count_fn, worker) -> dict:
    """Run ``worker()`` in a daemon thread and return immediately. One run per
    routine ``name`` at a time; ``count_fn`` gives a best-effort target count for
    the reply (purely informational)."""
    with _bg_lock:
        if name in _bg_running:
            return {"status": "already_running", "routine": name}
        _bg_running.add(name)
    try:
        targets = count_fn()
    except Exception:
        targets = None

    def _run() -> None:
        try:
            worker()
            _log.info("%s: background run done", name)
        except Exception:
            _log.exception("%s: background run crashed", name)
        finally:
            with _bg_lock:
                _bg_running.discard(name)

    threading.Thread(target=_run, name=name, daemon=True).start()
    return {"status": "started", "routine": name, "targets": targets}


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


def enrich_fundamentals(
    symbols: list[str] | None = None,
    limit: int = 0,
    force: bool = False,
) -> dict:
    """Populate annual fundamentals (FMP Starter: annual-only) for us_equity
    rows. Either an explicit ``symbols`` list, or — when ``limit`` is given —
    the next ``limit`` eligible stocks (profile-enriched, non-ETF, largest cap
    first). Three FMP calls per symbol (income statement, cash flow, ratios);
    skips already-done rows unless ``force``. Resumable: re-run to continue."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}
    if not fmp.configured():
        return {"error": "FMP_API_KEY not configured"}

    if not symbols and limit > 0:
        symbols = db.fundamentals_target_symbols(limit, only_missing=not force)
    symbols = symbols or []
    if not symbols:
        return {"error": "pass symbols=... or limit=N"}

    t0 = time.monotonic()
    already = set() if force else db.fundamentals_enriched_symbols()
    enriched = skipped = not_found = failed = 0

    for sym in symbols:
        if sym in already:
            skipped += 1
            continue
        try:
            income = fmp.fetch_income_statement(sym, limit=5)
            if not income:
                _log.info("enrich-fundamentals: no income statement for %s", sym)
                not_found += 1
                continue
            cash = fmp.fetch_cash_flow(sym, limit=5)
            ratios = fmp.fetch_ratios(sym, limit=1)
            row = fmp.map_fundamentals(sym, income, cash, ratios)
            if not row:
                not_found += 1
                continue
            db.upsert_fundamentals(row)
            enriched += 1
            _log.info("enrich-fundamentals: enriched %s", sym)
        except Exception as exc:
            _log.warning("enrich-fundamentals: FMP failed for %s: %s", sym, exc)
            failed += 1
        time.sleep(fmp.CALL_DELAY)

    return {
        "requested":               len(symbols),
        "fundamentals_enriched":   enriched,
        "fundamentals_already":    skipped,
        "fundamentals_not_found":  not_found,
        "fundamentals_failed":     failed,
        "duration_seconds":        round(time.monotonic() - t0, 1),
    }


# ── Per-widget refresh routines (background; refresh = re-pull already-enriched
# rows). Each completes one card: every DB value the card shows is re-fetched.
# `include_missing=True` additionally onboards rows that card hasn't enriched yet.

def refresh_profile_stocks(include_missing: bool = False) -> dict:
    """Refresh every **Profile** card stock field (FMP `/profile`: sector,
    industry, market cap, beta, CEO, employees, HQ, IPO, logo, description) for
    already-enriched stocks, in a background thread."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}
    if not fmp.configured():
        return {"error": "FMP_API_KEY not configured"}

    def _worker() -> None:
        syms = set(db.enriched_stock_symbols())
        if include_missing:
            syms |= set(db.unenriched_stock_symbols(1_000_000))
        enrich_stocks(symbols=sorted(syms), force=True)

    return _start_background(
        "refresh-profile-stocks", lambda: len(db.enriched_stock_symbols()), _worker
    )


def refresh_profile_crypto() -> dict:
    """Refresh every **Profile** card crypto field (CoinGecko: categories, supply,
    market-cap rank, ATH/ATL, links, description) for crypto rows, in a
    background thread."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}

    return _start_background(
        "refresh-profile-crypto",
        lambda: len(db.enriched_crypto_symbols()),
        lambda: run_seed(force=True, base=False),
    )


def refresh_fundamentals(include_missing: bool = False) -> dict:
    """Refresh every **Fundamentals** card field (FMP statements: valuation,
    margins, ROE/ROIC, growth, dividend, 5-yr trend) for stocks that already
    carry fundamentals, in a background thread."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}
    if not fmp.configured():
        return {"error": "FMP_API_KEY not configured"}

    def _worker() -> None:
        syms = set(db.fundamentals_enriched_symbols())
        if include_missing:
            syms |= set(db.fundamentals_target_symbols(1_000_000, only_missing=True))
        enrich_fundamentals(symbols=sorted(syms), force=True)

    return _start_background(
        "refresh-fundamentals", lambda: len(db.fundamentals_enriched_symbols()), _worker
    )


def refresh_all_stocks(include_missing: bool = False) -> dict:
    """Refresh ALL stock enrichment in one background flow — the **Profile** card
    (FMP `/profile`) then the **Fundamentals** card (FMP statements). Superset of
    `refresh_profile_stocks` + `refresh_fundamentals`. `include_missing=True` also
    onboards stocks/fundamentals not enriched yet."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}
    if not fmp.configured():
        return {"error": "FMP_API_KEY not configured"}

    def _worker() -> None:
        prof = set(db.enriched_stock_symbols())
        if include_missing:
            prof |= set(db.unenriched_stock_symbols(1_000_000))
        enrich_stocks(symbols=sorted(prof), force=True)
        # Recompute after the profile pass so any rows just onboarded also get
        # their fundamentals.
        fund = set(db.fundamentals_enriched_symbols())
        if include_missing:
            fund |= set(db.fundamentals_target_symbols(1_000_000, only_missing=True))
        enrich_fundamentals(symbols=sorted(fund), force=True)

    return _start_background(
        "refresh-all-stocks", lambda: len(db.enriched_stock_symbols()), _worker
    )


def refresh_alpaca() -> dict:
    """Re-pull the full Alpaca universe and upsert **base identity + trading
    status** for every row — tradable, status (active/inactive on delisting),
    marginable, shortable, fractionable, attributes (e.g. has_options), name,
    exchange, and crypto increments — onboarding any new listings on the way.
    Background, because the row-by-row base upsert is ~14 min."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}

    return _start_background(
        "refresh-alpaca",
        lambda: None,
        lambda: run_seed(force=False, base=True),
    )


def check_new_symbols() -> dict:
    """Fast, read-only: Alpaca's current active universe minus what's already in
    the catalogue — i.e. new listings / IPOs not yet onboarded. No writes; the
    expensive base upsert is skipped, so this is seconds, not minutes."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}
    assets = get_all_assets_for_seed()
    existing = db.all_symbols()
    new = [a for a in assets if a["symbol"] not in existing]
    return {
        "new_count": len(new),
        "us_equity": sorted(a["symbol"] for a in new if a.get("asset_class") == "us_equity"),
        "crypto": sorted(a["symbol"] for a in new if a.get("asset_class") == "crypto"),
    }


def enrich_fxcm_stocks(force: bool = False) -> dict:
    """FMP-enrich FXCM stock_cfd rows.  Tries the bare ticker first (covers US
    ADRs like ASML, SAP), then the home-exchange suffix (ASML.AS, SAP.DE) as a
    fallback for local-only listings.  Skips already-enriched rows unless
    ``force``."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}
    if not fmp.configured():
        return {"error": "FMP_API_KEY not configured"}

    symbols = db.unenriched_fxcm_stock_symbols() if not force else _all_fxcm_stock_symbols()
    if not symbols:
        return {"fxcm_stocks_enriched": 0, "not_found": 0, "failed": 0, "duration_seconds": 0}

    t0 = time.monotonic()
    enriched = not_found = failed = 0

    for sym in symbols:
        candidates = fmp.fxcm_stock_to_fmp_candidates(sym)
        if not candidates:
            not_found += 1
            continue
        data: dict | None = None
        used_ticker: str | None = None
        for ticker in candidates:
            try:
                data = fmp.fetch_profile_raw(ticker) if "." in ticker else fmp.fetch_profile(ticker)
                if data:
                    used_ticker = ticker
                    break
            except Exception as exc:
                _log.warning("enrich-fxcm-stocks: FMP error for %s (%s): %s", sym, ticker, exc)
        if not data:
            _log.info("enrich-fxcm-stocks: no FMP profile for %s", sym)
            not_found += 1
            time.sleep(fmp.CALL_DELAY)
            continue
        try:
            row = fmp.map_stock_enrichment(sym, data)
            row["fmp_ticker"] = used_ticker
            db.upsert_fxcm_stock_enrichment(row)
            enriched += 1
            _log.info("enrich-fxcm-stocks: enriched %s via %s", sym, used_ticker)
        except Exception as exc:
            _log.warning("enrich-fxcm-stocks: DB write failed for %s: %s", sym, exc)
            failed += 1
        time.sleep(fmp.CALL_DELAY)

    return {
        "requested":            len(symbols),
        "fxcm_stocks_enriched": enriched,
        "not_found":            not_found,
        "failed":               failed,
        "duration_seconds":     round(time.monotonic() - t0, 1),
    }


def _all_fxcm_stock_symbols() -> list[str]:
    return db.fxcm_stock_symbols(only_unenriched=False)


def refresh_fxcm_stocks() -> dict:
    """Re-enrich all FXCM stock_cfd rows (re-pulls FMP for every row already
    enriched, in a background thread)."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}
    if not fmp.configured():
        return {"error": "FMP_API_KEY not configured"}

    return _start_background(
        "refresh-fxcm-stocks",
        lambda: len(_all_fxcm_stock_symbols()),
        lambda: enrich_fxcm_stocks(force=True),
    )


def refresh_all_crypto() -> dict:
    """Refresh ALL crypto enrichment (CoinGecko) in one background flow. Crypto's
    only enrichment source is the **Profile** card, so this matches
    `refresh_profile_crypto` today and also picks up any un-enriched crypto."""
    if not db.db_enabled():
        return {"error": "DATABASE_URL not configured"}

    return _start_background(
        "refresh-all-crypto",
        lambda: len(db.enriched_crypto_symbols()),
        lambda: run_seed(force=True, base=False),
    )


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
