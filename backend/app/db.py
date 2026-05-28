"""Postgres (Supabase) access via pg8000 — pure-Python, no C extensions
(Python 3.14 / Vercel safe, per docs/landmines.md).

Per-operation connections built lazily from ``DATABASE_URL`` (the Supabase
Session pooler URI; IPv4, free). DB-backed features degrade gracefully: an
unset/unreachable database raises ``DbUnavailable`` which callers swallow into
a 503-style fallback, mirroring the Alpaca-keys seam.
"""

from __future__ import annotations

import json
import logging
import math
import ssl
import time
from contextlib import contextmanager
from datetime import date
from urllib.parse import unquote, urlparse

import pg8000.dbapi

from .config import get_settings

_log = logging.getLogger(__name__)


class DbUnavailable(RuntimeError):
    """DATABASE_URL unset or the database can't be reached."""


def db_enabled() -> bool:
    return get_settings().db_configured


def _conn_kwargs() -> dict:
    s = get_settings()
    if not s.database_url:
        raise DbUnavailable("DATABASE_URL not configured")
    u = urlparse(s.database_url)
    if s.database_ssl_insecure:
        ctx: object = ssl.create_default_context()
        ctx.check_hostname = False
        ctx.verify_mode = ssl.CERT_NONE
    else:
        ctx = True  # pg8000: default verified TLS
    return dict(
        user=unquote(u.username or ""),
        password=unquote(u.password or ""),
        host=u.hostname,
        port=u.port or 5432,
        database=(u.path or "/postgres").lstrip("/") or "postgres",
        ssl_context=ctx,
        timeout=10,
    )


@contextmanager
def _connect():
    try:
        conn = pg8000.dbapi.connect(**_conn_kwargs())
    except DbUnavailable:
        raise
    except Exception as exc:  # connection-level failure
        raise DbUnavailable(f"cannot connect to database: {exc}") from exc
    try:
        yield conn
        conn.commit()
    except Exception:
        conn.rollback()
        raise
    finally:
        conn.close()


# ---- app settings (maintenance / force-stop switches) -----------------------

# Flags are read on every /api/status poll; cache briefly so a long-lived
# process (Render) doesn't hit the DB each time. On Vercel each invocation is a
# fresh process, so this is effectively a no-op there — fine, polls are
# infrequent. Two switches: `maintenance` (graceful, auto-recovers) and
# `force_stop` (terminal boot — client stops all polling, manual reload only).
_MAINT_TTL = 15.0
_flags_cache: tuple[float, dict] | None = None


def _flag_on(v: object) -> bool:
    return str(v).strip().lower() in ("on", "true", "1", "yes")


def get_app_flags() -> dict:
    """Return ``{maintenance, message, force_stop, force_stop_message}`` from the
    ``app_settings`` table. Raises ``DbUnavailable`` if the DB is unreachable so
    the caller can fail open (DB down must never lock everyone out). Missing keys
    default off, so deploying before the rows exist is safe."""
    global _flags_cache
    now = time.monotonic()
    if _flags_cache and now - _flags_cache[0] < _MAINT_TTL:
        return dict(_flags_cache[1])
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT key, value FROM app_settings WHERE key IN "
            "('maintenance', 'maintenance_message', "
            "'force_stop', 'force_stop_message')"
        )
        rows = {k: v for k, v in cur.fetchall()}
    result = {
        "maintenance": _flag_on(rows.get("maintenance", "off")),
        "message": rows.get("maintenance_message") or "",
        "force_stop": _flag_on(rows.get("force_stop", "off")),
        "force_stop_message": rows.get("force_stop_message") or "",
    }
    _flags_cache = (now, result)
    return dict(result)


# ---- assets table -----------------------------------------------------------

def bulk_upsert_assets(assets: list[dict], chunk_size: int = 500) -> int:
    """Upsert Alpaca base identity data; returns total rows processed."""
    if not assets:
        return 0
    total = 0
    for i in range(0, len(assets), chunk_size):
        chunk = assets[i : i + chunk_size]
        with _connect() as conn:
            cur = conn.cursor()
            for a in chunk:
                cur.execute(
                    """
                    INSERT INTO assets
                        (symbol, alpaca_id, name, asset_class, exchange, status,
                         tradable, marginable, shortable, fractionable,
                         attributes, min_order_size, min_trade_increment,
                         price_increment, seeded_at)
                    VALUES
                        (%s, %s::uuid, %s, %s, %s, %s,
                         %s, %s, %s, %s,
                         %s, %s, %s, %s, now())
                    ON CONFLICT (symbol) DO UPDATE SET
                        alpaca_id           = excluded.alpaca_id,
                        name                = excluded.name,
                        asset_class         = excluded.asset_class,
                        exchange            = excluded.exchange,
                        status              = excluded.status,
                        tradable            = excluded.tradable,
                        marginable          = excluded.marginable,
                        shortable           = excluded.shortable,
                        fractionable        = excluded.fractionable,
                        attributes          = excluded.attributes,
                        min_order_size      = excluded.min_order_size,
                        min_trade_increment = excluded.min_trade_increment,
                        price_increment     = excluded.price_increment,
                        seeded_at           = now()
                    """,
                    (
                        a["symbol"], a.get("alpaca_id"), a.get("name"),
                        a["asset_class"], a.get("exchange"), a.get("status"),
                        a.get("tradable"), a.get("marginable"), a.get("shortable"),
                        a.get("fractionable"), a.get("attributes"),
                        a.get("min_order_size"), a.get("min_trade_increment"),
                        a.get("price_increment"),
                    ),
                )
        total += len(chunk)
    return total


_SEARCH_COLS = (
    "symbol", "name", "exchange", "asset_class", "status", "tradable",
    "marginable", "shortable", "fractionable", "sector", "logo_url",
    "market_cap",
)
# SELECT projection matching _SEARCH_COLS, shared by get_asset + search_assets.
_SEARCH_SELECT = (
    "symbol, COALESCE(name, symbol) AS name, COALESCE(exchange, '') AS exchange, "
    "asset_class, COALESCE(status, '') AS status, COALESCE(tradable, false) AS tradable, "
    "COALESCE(marginable, false) AS marginable, COALESCE(shortable, false) AS shortable, "
    "COALESCE(fractionable, false) AS fractionable, sector, logo_url, market_cap"
)


def get_asset(symbol: str) -> dict | None:
    """Single catalogue row (static identity + enrichment), or None if the
    symbol isn't seeded yet."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT " + _SEARCH_SELECT + " FROM assets WHERE symbol = %s",
            (symbol.strip().upper(),),
        )
        row = cur.fetchone()
        return dict(zip(_SEARCH_COLS, row)) if row else None


_PROFILE_COLS = (
    "symbol", "name", "exchange", "asset_class", "status",
    "tradable", "marginable", "shortable", "fractionable",
    "description", "website", "logo_url", "market_cap",
    "sector", "industry", "country", "city", "state", "ipo_date",
    "isin", "cik", "is_etf", "is_adr", "is_fund", "is_actively_trading",
    "ceo", "employees", "beta",
    "coingecko_id", "hashing_algorithm", "genesis_date", "categories",
    "whitepaper_url", "github_url", "circulating_supply", "total_supply",
    "max_supply", "market_cap_rank", "ath_usd", "ath_date", "atl_usd", "atl_date",
    "pe_ratio", "ps_ratio", "pb_ratio", "ev_to_ebitda", "peg_ratio",
    "gross_margin", "operating_margin", "net_margin", "roe", "roic",
    "debt_to_equity", "current_ratio", "eps_diluted", "book_value_per_share",
    "free_cash_flow", "revenue_growth_yoy", "eps_growth_yoy", "dividend_yield",
    "payout_ratio", "latest_fiscal_year", "reported_currency", "financials_annual",
    "fundamentals_enriched_at",
    "enriched_at", "enrichment_source",
)

# NUMERIC columns come back from pg8000 as Decimal, which serialises to a JSON
# string — coerce to float so the frontend gets real numbers (BIGINT/INTEGER
# columns like market_cap / employees / market_cap_rank already arrive as int).
_PROFILE_FLOAT_COLS = frozenset({
    "beta", "circulating_supply", "total_supply", "max_supply",
    "ath_usd", "atl_usd",
    "pe_ratio", "ps_ratio", "pb_ratio", "ev_to_ebitda", "peg_ratio",
    "gross_margin", "operating_margin", "net_margin", "roe", "roic",
    "debt_to_equity", "current_ratio", "eps_diluted", "book_value_per_share",
    "free_cash_flow", "revenue_growth_yoy", "eps_growth_yoy", "dividend_yield",
    "payout_ratio",
})


def get_asset_profile(symbol: str) -> dict | None:
    """Full catalogue row for one symbol — base identity plus every enrichment
    column, with NULL-valued keys dropped (so a stock row never carries empty
    crypto fields and vice versa). ``None`` if the symbol isn't seeded.

    Not visibility-filtered: like ``get_asset`` this is direct resolution of a
    user-named symbol, so an un-enriched row still returns its base identity.
    """
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT " + ", ".join(_PROFILE_COLS) + " FROM assets WHERE symbol = %s",
            (symbol.strip().upper(),),
        )
        row = cur.fetchone()
        if not row:
            return None
        out: dict = {}
        for k, v in zip(_PROFILE_COLS, row):
            if v is None:
                continue
            if k == "financials_annual":
                out[k] = json.loads(v) if isinstance(v, str) else v
            elif k in _PROFILE_FLOAT_COLS:
                out[k] = float(v)
            else:
                out[k] = v
        return out


def market_cap_map() -> dict[str, int]:
    """``{symbol: market_cap}`` for the visible US-equity universe (tradable +
    enriched + has a cap). Used by the earnings calendar to drop the OTC/microcap
    long tail and rank by size. Raises ``DbUnavailable`` like the other readers;
    callers swallow it into an empty map.
    """
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT symbol, market_cap FROM assets WHERE asset_class = 'us_equity' "
            "AND tradable = true AND enrichment_source IS NOT NULL "
            "AND market_cap IS NOT NULL"
        )
        return {row[0]: int(row[1]) for row in cur.fetchall()}


def search_assets(query: str, asset_class: str, limit: int) -> list[dict]:
    """Symbol/name search over the catalogue, ranked by market cap (so the
    likely-intended name surfaces first). ``asset_class``: '' = all,
    'us_equity', or 'crypto'. Empty query returns the top rows by market cap.

    Visibility rule: only **tradable + enriched** rows are returned, so the
    un-enriched long tail (SPAC shells, warrants, dead OTC tickers) stays out
    of discovery. This is search-only — direct resolution (`get_asset`) and
    things the user already references (positions/watchlist) are never hidden.
    """
    q = query.strip()
    like = f"%{q}%"
    prefix = f"{q}%"
    where = [
        "tradable = true",
        "enrichment_source IS NOT NULL",
        "(symbol ILIKE %s OR name ILIKE %s)",
    ]
    params: list = [like, like]
    if asset_class in ("us_equity", "crypto"):
        where.insert(0, "asset_class = %s")
        params.insert(0, asset_class)
    params.extend([prefix, limit])
    sql = (
        "SELECT " + _SEARCH_SELECT + " FROM assets WHERE " + " AND ".join(where) +
        " ORDER BY (symbol ILIKE %s) DESC, market_cap DESC NULLS LAST, symbol "
        "LIMIT %s"
    )
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        return [dict(zip(_SEARCH_COLS, row)) for row in cur.fetchall()]


# ---- screen_assets (structured catalogue filter) ----------------------------

# Canonical crypto-category keys -> the raw CoinGecko tag(s) each maps to. The
# screener exposes only these curated keys: the raw `categories` array is ~54%
# index / VC-portfolio / "X Ecosystem" noise (see docs/database.md). KEEP
# THE KEYS IN SYNC with the `category` enum in ai/tools_read.py.
CRYPTO_CATEGORY_MAP: dict[str, list[str]] = {
    "defi":           ["Decentralized Finance (DeFi)"],
    "layer1":         ["Layer 1 (L1)", "Smart Contract Platform"],
    "dex":            ["Decentralized Exchange (DEX)", "Automated Market Maker (AMM)"],
    "meme":           ["Meme", "Dog-Themed", "4chan-Themed"],
    "stablecoin":     ["Stablecoin", "Fiat-backed Stablecoin", "Stablecoin Issuer"],
    "ai":             ["Artificial Intelligence (AI)"],
    "rwa":            ["Real World Assets (RWA)", "RWA Protocol"],
    "depin":          ["DePIN"],
    "governance":     ["Governance"],
    "yield":          ["Yield Farming", "Yield Aggregator"],
    "exchange_token": ["Exchange-based Tokens"],
    "pos":            ["Proof of Stake (PoS)"],
    "pow":            ["Proof of Work (PoW)"],
    "btc_fork":       ["Bitcoin Fork"],
    "infrastructure": ["Infrastructure"],
}

# GICS sectors (FMP) and the exchanges seen in the catalogue — validated server
# side so a stray value never silently returns a confusing empty set.
_SCREEN_SECTORS = frozenset({
    "Basic Materials", "Communication Services", "Consumer Cyclical",
    "Consumer Defensive", "Energy", "Financial Services", "Healthcare",
    "Industrials", "Real Estate", "Technology", "Utilities",
})
_SCREEN_EXCHANGES = frozenset({"NASDAQ", "NYSE", "ARCA", "BATS", "AMEX", "OTC"})

# Whitelisted sort keys -> fixed ORDER BY fragments. Values never come from the
# caller, so the fragment is safe to inline; the model only picks a key.
_SORT_MAP = {
    "market_cap_desc":     "market_cap DESC NULLS LAST",
    "market_cap_asc":      "market_cap ASC NULLS LAST",
    "beta_desc":           "beta DESC NULLS LAST",
    "beta_asc":            "beta ASC NULLS LAST",
    "ipo_newest":          "ipo_date DESC NULLS LAST",
    "ipo_oldest":          "ipo_date ASC NULLS LAST",
    "pe_asc":              "pe_ratio ASC NULLS LAST",
    "pe_desc":             "pe_ratio DESC NULLS LAST",
    "dividend_yield_desc": "dividend_yield DESC NULLS LAST",
    "net_margin_desc":     "net_margin DESC NULLS LAST",
    "roe_desc":            "roe DESC NULLS LAST",
    "revenue_growth_desc": "revenue_growth_yoy DESC NULLS LAST",
}
_CRYPTO_SORTS = frozenset({"market_cap_desc", "market_cap_asc"})  # crypto rows have no beta/ipo


def _resolve_sort(sort_by, is_crypto):
    """Pure: map a sort key -> (order_sql, resolved_key, ignored_note|None).
    Unknown keys, or stocks-only keys on a crypto screen, fall back to
    market_cap_desc and report why via the note."""
    key = sort_by or "market_cap_desc"
    if key not in _SORT_MAP:
        note = f"sort_by={sort_by}" if sort_by else None
        return _SORT_MAP["market_cap_desc"], "market_cap_desc", note
    if is_crypto and key not in _CRYPTO_SORTS:
        return _SORT_MAP["market_cap_desc"], "market_cap_desc", f"sort_by={key} (stocks-only)"
    return _SORT_MAP[key], key, None


def _clampf(v, lo=None, hi=None):
    """Coerce to float, reject NaN/inf, clamp to [lo, hi]; None on bad input."""
    if v is None:
        return None
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    if math.isnan(f) or math.isinf(f):
        return None
    if lo is not None and f < lo:
        f = lo
    if hi is not None and f > hi:
        f = hi
    return f


def _parse_iso_date(s):
    try:
        y, m, d = str(s).strip().split("-")
        return date(int(y), int(m), int(d))
    except Exception:
        return None


def _screen_filters(
    asset_class, sector, industry, asset_type, category,
    market_cap_min, market_cap_max, beta_min, beta_max,
    exchange, ipo_after, ipo_before,
    pe_min=None, pe_max=None, dividend_yield_min=None,
    net_margin_min=None, roe_min=None, revenue_growth_min=None,
):
    """Pure filter builder -> (where_sql, params, applied, ignored, resolved
    class). No DB access. The security boundary lives here: every value is
    enum-validated or numerically clamped, then bound as a %s parameter — the
    SQL template is fixed and never sees a model-supplied value inline.
    """
    ac = asset_class if asset_class in ("us_equity", "crypto") else "us_equity"
    is_crypto = ac == "crypto"
    where = ["tradable = true", "enrichment_source IS NOT NULL", "asset_class = %s"]
    params: list = [ac]
    applied: dict = {"asset_class": ac}
    ignored: list = []

    mn = _clampf(market_cap_min, lo=0)
    if mn is not None:
        mn = int(mn)  # market_cap is BIGINT — bind an int, not a float
        where.append("market_cap >= %s"); params.append(mn); applied["market_cap_min"] = mn
    mx = _clampf(market_cap_max, lo=0)
    if mx is not None:
        mx = int(mx)
        where.append("market_cap <= %s"); params.append(mx); applied["market_cap_max"] = mx

    if is_crypto:
        if category:
            raw = CRYPTO_CATEGORY_MAP.get(str(category).lower())
            if raw:
                where.append("categories && %s::text[]"); params.append(raw)
                applied["category"] = str(category).lower()
            else:
                ignored.append(f"category={category}")
        for label, val in (("sector", sector), ("industry", industry),
                           ("asset_type", asset_type if asset_type != "stock" else None),
                           ("exchange", exchange), ("beta_min", beta_min),
                           ("beta_max", beta_max), ("ipo_after", ipo_after),
                           ("ipo_before", ipo_before), ("pe_min", pe_min),
                           ("pe_max", pe_max), ("dividend_yield_min", dividend_yield_min),
                           ("net_margin_min", net_margin_min), ("roe_min", roe_min),
                           ("revenue_growth_min", revenue_growth_min)):
            if val not in (None, ""):
                ignored.append(f"{label} (stocks-only)")
    else:
        at = asset_type if asset_type in ("stock", "etf", "adr", "any") else "stock"
        if at == "stock":
            where.append("is_etf IS NOT TRUE AND is_fund IS NOT TRUE")
        elif at == "etf":
            where.append("is_etf IS TRUE")
        elif at == "adr":
            where.append("is_adr IS TRUE")
        applied["asset_type"] = at

        if sector:
            if sector in _SCREEN_SECTORS:
                where.append("sector = %s"); params.append(sector); applied["sector"] = sector
            else:
                ignored.append(f"sector={sector}")
        if industry:
            where.append("industry ILIKE %s"); params.append(f"%{industry}%")
            applied["industry"] = industry
        if exchange:
            ex = str(exchange).upper()
            if ex in _SCREEN_EXCHANGES:
                where.append("exchange = %s"); params.append(ex); applied["exchange"] = ex
            else:
                ignored.append(f"exchange={exchange}")
        bmn = _clampf(beta_min, lo=-100, hi=100)
        if bmn is not None:
            where.append("beta >= %s"); params.append(bmn); applied["beta_min"] = bmn
        bmx = _clampf(beta_max, lo=-100, hi=100)
        if bmx is not None:
            where.append("beta <= %s"); params.append(bmx); applied["beta_max"] = bmx

        lo = _parse_iso_date(ipo_after) if ipo_after else None
        hi = _parse_iso_date(ipo_before) if ipo_before else None
        if lo or hi:
            floor = date(1980, 1, 1)  # guard against epoch-garbage ipo_date
            lo = max(lo or floor, floor)
            where.append("ipo_date >= %s"); params.append(lo); applied["ipo_after"] = lo.isoformat()
            if hi:
                where.append("ipo_date <= %s"); params.append(hi); applied["ipo_before"] = hi.isoformat()

        # Fundamentals filters (annual, FMP) — fractions for margin/roe/growth/yield
        # (0.2 = 20%); only enriched rows carry these, NULLs drop out of >= / <=.
        pmn = _clampf(pe_min)
        if pmn is not None:
            where.append("pe_ratio >= %s"); params.append(pmn); applied["pe_min"] = pmn
        pmx = _clampf(pe_max)
        if pmx is not None:
            where.append("pe_ratio <= %s"); params.append(pmx); applied["pe_max"] = pmx
        dymn = _clampf(dividend_yield_min, lo=0)
        if dymn is not None:
            where.append("dividend_yield >= %s"); params.append(dymn); applied["dividend_yield_min"] = dymn
        nmmn = _clampf(net_margin_min, lo=-100, hi=100)
        if nmmn is not None:
            where.append("net_margin >= %s"); params.append(nmmn); applied["net_margin_min"] = nmmn
        roemn = _clampf(roe_min, lo=-100, hi=100)
        if roemn is not None:
            where.append("roe >= %s"); params.append(roemn); applied["roe_min"] = roemn
        rgmn = _clampf(revenue_growth_min, lo=-100, hi=100)
        if rgmn is not None:
            where.append("revenue_growth_yoy >= %s"); params.append(rgmn); applied["revenue_growth_min"] = rgmn

        if category:
            ignored.append("category (crypto-only)")

    return " AND ".join(where), params, applied, ignored, ac


def screen_assets(*, asset_class="us_equity", sector=None, industry=None,
                  asset_type="stock", category=None, market_cap_min=None,
                  market_cap_max=None, beta_min=None, beta_max=None,
                  exchange=None, ipo_after=None, ipo_before=None,
                  pe_min=None, pe_max=None, dividend_yield_min=None,
                  net_margin_min=None, roe_min=None, revenue_growth_min=None,
                  sort_by=None, limit=20) -> dict:
    """Structured screen over the catalogue — visibility-filtered (enriched +
    tradable), parameterised, capped. Returns a count + top-N-by-market-cap
    envelope; crypto results collapse to one row per base coin (preferring the
    /USD pair). See docs/database.md for the design rationale.
    """
    try:
        lim = int(limit)
    except (TypeError, ValueError):
        lim = 20
    lim = max(1, min(lim, 50))

    where_sql, params, applied, ignored, ac = _screen_filters(
        asset_class, sector, industry, asset_type, category,
        market_cap_min, market_cap_max, beta_min, beta_max,
        exchange, ipo_after, ipo_before,
        pe_min, pe_max, dividend_yield_min, net_margin_min, roe_min,
        revenue_growth_min,
    )
    is_crypto = ac == "crypto"
    order_sql, sorted_key, sort_ignored = _resolve_sort(sort_by, is_crypto)
    if sort_ignored:
        ignored.append(sort_ignored)

    with _connect() as conn:
        cur = conn.cursor()
        if is_crypto:
            cur.execute(
                "SELECT COUNT(DISTINCT split_part(symbol, '/', 1)) FROM assets WHERE "
                + where_sql, params,
            )
            total = int(cur.fetchone()[0])
            cur.execute(
                "SELECT symbol, COALESCE(name, symbol), market_cap, market_cap_rank FROM ("
                " SELECT DISTINCT ON (split_part(symbol, '/', 1)) symbol, name,"
                " market_cap, market_cap_rank FROM assets WHERE " + where_sql +
                " ORDER BY split_part(symbol, '/', 1), (right(symbol, 4) = '/USD') DESC,"
                " symbol) t ORDER BY " + order_sql + ", symbol LIMIT %s",
                params + [lim],
            )
            cols = ("symbol", "name", "market_cap", "market_cap_rank")
            results = [dict(zip(cols, r)) for r in cur.fetchall()]
        else:
            cur.execute("SELECT COUNT(*) FROM assets WHERE " + where_sql, params)
            total = int(cur.fetchone()[0])
            cur.execute(
                "SELECT symbol, COALESCE(name, symbol), sector, industry, market_cap,"
                " beta, pe_ratio, dividend_yield, net_margin, roe, revenue_growth_yoy"
                " FROM assets WHERE " + where_sql +
                " ORDER BY " + order_sql + ", symbol LIMIT %s",
                params + [lim],
            )
            cols = ("symbol", "name", "sector", "industry", "market_cap", "beta",
                    "pe_ratio", "dividend_yield", "net_margin", "roe",
                    "revenue_growth_yoy")
            results = [dict(zip(cols, r)) for r in cur.fetchall()]

        out: dict = {
            "total_matches": total,
            "returned": len(results),
            "has_more": total > len(results),
            "sorted_by": sorted_key,
            "asset_class": ac,
            "filters_applied": applied,
            "results": results,
        }
        if ignored:
            out["ignored_filters"] = ignored
        if total == 0:
            out["suggestion"] = (
                "No matches. Widen the market-cap bounds, drop the sector/industry"
                " filter, or set asset_type='any'. Only enriched, tradable assets are"
                " screenable (large & options-listed US names + major crypto)."
            )
            # Industry is a free-text partial match; a miss usually means the
            # caller guessed FMP's label wrong (e.g. 'Pharma' vs 'Drug
            # Manufacturers'). Hand back the real values so it can retry.
            if not is_crypto and "industry" in applied:
                sug_where = ("tradable = true AND enrichment_source IS NOT NULL"
                             " AND asset_class = 'us_equity' AND industry IS NOT NULL")
                sug_params: list = []
                if "sector" in applied:
                    sug_where += " AND sector = %s"; sug_params.append(applied["sector"])
                cur.execute(
                    "SELECT DISTINCT industry FROM assets WHERE " + sug_where
                    + " ORDER BY industry", sug_params,
                )
                all_inds = [r[0] for r in cur.fetchall()]
                toks = [t for t in str(industry).lower().replace("-", " ").replace("/", " ").split() if t]
                ranked = sorted(all_inds, key=lambda s: (0 if any(t in s.lower() for t in toks) else 1, s))
                out["industry_suggestions"] = ranked[:15]
        elif not is_crypto and out["has_more"] and "sector" not in applied:
            cur.execute(
                "SELECT COALESCE(sector, '(unknown)'), COUNT(*) FROM assets WHERE "
                + where_sql + " GROUP BY sector ORDER BY COUNT(*) DESC LIMIT 12",
                params,
            )
            out["bucket_counts_by_sector"] = {row[0]: int(row[1]) for row in cur.fetchall()}
    return out


# ---- fxcm_instruments table -------------------------------------------------

def get_fxcm_display_names() -> dict[str, str]:
    """Return {name: display_name} for all rows in fxcm_instruments where
    display_name is non-null and differs from name. Callers fall back to
    the raw name when a key is absent."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT name, display_name FROM fxcm_instruments "
            "WHERE display_name IS NOT NULL AND display_name <> name"
        )
        return {row[0]: row[1] for row in cur.fetchall()}


def get_fxcm_underlying_units() -> dict[str, str]:
    """Return {name: underlying_unit} for FXCM instruments where underlying_unit is non-null."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT name, underlying_unit FROM fxcm_instruments "
            "WHERE underlying_unit IS NOT NULL AND underlying_unit <> ''"
        )
        return {row[0]: row[1] for row in cur.fetchall()}


def search_fxcm_instruments(q: str, limit: int = 50) -> list[dict]:
    """Search FXCM instruments by name, display_name, or alternatives (case-insensitive)."""
    with _connect() as conn:
        cur = conn.cursor()
        pattern = f"%{q}%"
        prefix = f"{q}%"
        cur.execute(
            """
            SELECT name, display_name, description, type
            FROM fxcm_instruments
            WHERE name ILIKE %s
               OR display_name ILIKE %s
               OR EXISTS (SELECT 1 FROM unnest(alternatives) alt WHERE alt ILIKE %s)
            ORDER BY
                CASE WHEN name ILIKE %s OR display_name ILIKE %s THEN 0 ELSE 1 END,
                name
            LIMIT %s
            """,
            (pattern, pattern, pattern, prefix, prefix, limit),
        )
        return [
            {"name": r[0], "display_name": r[1], "description": r[2], "type": r[3]}
            for r in cur.fetchall()
        ]


def upsert_fxcm_instruments(rows: list[dict]) -> int:
    """Upsert FXCM instrument metadata; returns count of rows processed."""
    if not rows:
        return 0
    with _connect() as conn:
        cur = conn.cursor()
        for r in rows:
            cur.execute(
                """
                INSERT INTO fxcm_instruments
                    (name, display_name, description, type, currency,
                     session, timezone, underlying_unit, alternatives, seeded_at)
                VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, now())
                ON CONFLICT (name) DO UPDATE SET
                    display_name    = excluded.display_name,
                    description     = excluded.description,
                    type            = excluded.type,
                    currency        = excluded.currency,
                    session         = excluded.session,
                    timezone        = excluded.timezone,
                    underlying_unit = excluded.underlying_unit,
                    alternatives    = excluded.alternatives,
                    seeded_at       = now()
                """,
                (
                    r["name"], r.get("display_name"), r.get("description"),
                    r.get("type"), r.get("currency"), r.get("session"),
                    r.get("timezone"), r.get("underlying_unit"),
                    r.get("alternatives") or [],
                ),
            )
    return len(rows)


def all_symbols() -> set[str]:
    """Every symbol currently in the catalogue (all classes) — used to diff
    against Alpaca's live list when checking for new listings."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT symbol FROM assets")
        return {row[0] for row in cur.fetchall()}


def _symbols(
    asset_class: str, enriched: bool | None, tradable_only: bool = False
) -> set[str]:
    """Catalogue symbols for one asset class, optionally filtered by enrichment
    state (None = all, True = enriched, False = un-enriched) and tradability."""
    where = "asset_class = %s"
    if enriched is True:
        where += " AND enrichment_source IS NOT NULL"
    elif enriched is False:
        where += " AND enrichment_source IS NULL"
    if tradable_only:
        where += " AND tradable = true"
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT symbol FROM assets WHERE " + where, (asset_class,))
        return {row[0] for row in cur.fetchall()}


def list_symbols(asset_class: str) -> list[str]:
    """Public symbol universe for one asset class under the search visibility
    rule (`tradable = true AND enrichment_source IS NOT NULL`) — the set the
    Ask-anything router validates tickers against. Sorted for a stable payload
    (deterministic gzip / caching)."""
    return sorted(_symbols(asset_class, enriched=True, tradable_only=True))


def crypto_symbols() -> set[str]:
    """All crypto symbols in the catalogue — used by enrich-only seed runs."""
    return _symbols("crypto", None)


def enriched_crypto_symbols() -> set[str]:
    """Crypto symbols that already carry enrichment — lets the seeder resume."""
    return _symbols("crypto", True)


def enriched_stock_symbols() -> set[str]:
    """us_equity symbols already enriched — lets the stock seeder resume."""
    return _symbols("us_equity", True)


def unenriched_stock_symbols(limit: int) -> list[str]:
    """Next un-enriched us_equity symbols, options-listed (real, liquid
    companies) first so a partial run does the meaningful names first."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT symbol FROM assets "
            "WHERE asset_class = 'us_equity' AND enrichment_source IS NULL "
            "ORDER BY (attributes @> ARRAY['has_options']::text[]) DESC NULLS LAST, "
            "symbol LIMIT %s",
            (limit,),
        )
        return [row[0] for row in cur.fetchall()]


def fundamentals_enriched_symbols() -> set[str]:
    """us_equity symbols that already carry annual fundamentals — lets the
    fundamentals seeder resume."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT symbol FROM assets WHERE fundamentals_enriched_at IS NOT NULL"
        )
        return {row[0] for row in cur.fetchall()}


def fundamentals_target_symbols(limit: int, only_missing: bool = True) -> list[str]:
    """Next ``limit`` fundamentals-eligible symbols (profile-enriched, non-ETF
    US equities), largest market cap first. ``only_missing`` skips rows already
    done — pass False for a forced full re-enrich."""
    where = (
        "asset_class = 'us_equity' AND enrichment_source = 'fmp' "
        "AND is_etf IS NOT TRUE AND is_fund IS NOT TRUE"
    )
    if only_missing:
        where += " AND fundamentals_enriched_at IS NULL"
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT symbol FROM assets WHERE " + where +
            " ORDER BY market_cap DESC NULLS LAST, symbol LIMIT %s",
            (limit,),
        )
        return [row[0] for row in cur.fetchall()]


def upsert_fundamentals(e: dict) -> None:
    """Write FMP annual-fundamentals columns for one us_equity row."""
    fa = e.get("financials_annual")
    fa_json = json.dumps(fa) if fa is not None else None
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE assets SET
                pe_ratio                 = %s,
                ps_ratio                 = %s,
                pb_ratio                 = %s,
                ev_to_ebitda             = %s,
                peg_ratio                = %s,
                gross_margin             = %s,
                operating_margin         = %s,
                net_margin               = %s,
                roe                      = %s,
                roic                     = %s,
                debt_to_equity           = %s,
                current_ratio            = %s,
                eps_diluted              = %s,
                book_value_per_share     = %s,
                free_cash_flow           = %s,
                revenue_growth_yoy       = %s,
                eps_growth_yoy           = %s,
                dividend_yield           = %s,
                payout_ratio             = %s,
                latest_fiscal_year       = %s,
                reported_currency        = %s,
                financials_annual        = %s::jsonb,
                fundamentals_enriched_at = now()
            WHERE symbol = %s
            """,
            (
                e.get("pe_ratio"), e.get("ps_ratio"), e.get("pb_ratio"),
                e.get("ev_to_ebitda"), e.get("peg_ratio"), e.get("gross_margin"),
                e.get("operating_margin"), e.get("net_margin"), e.get("roe"),
                e.get("roic"), e.get("debt_to_equity"), e.get("current_ratio"),
                e.get("eps_diluted"), e.get("book_value_per_share"),
                e.get("free_cash_flow"), e.get("revenue_growth_yoy"),
                e.get("eps_growth_yoy"), e.get("dividend_yield"),
                e.get("payout_ratio"), e.get("latest_fiscal_year"),
                e.get("reported_currency"), fa_json, e["symbol"],
            ),
        )


def upsert_stock_enrichment(e: dict) -> None:
    """Write FMP stock-enrichment columns for one us_equity row."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE assets SET
                description         = %s,
                website             = %s,
                logo_url            = %s,
                market_cap          = %s,
                sector              = %s,
                industry            = %s,
                country             = %s,
                city                = %s,
                state               = %s,
                ipo_date            = %s,
                isin                = %s,
                cik                 = %s,
                is_etf              = %s,
                is_adr              = %s,
                is_fund             = %s,
                is_actively_trading = %s,
                ceo                 = %s,
                employees           = %s,
                phone               = %s,
                beta                = %s,
                enriched_at         = now(),
                enrichment_source   = %s
            WHERE symbol = %s
            """,
            (
                e.get("description"), e.get("website"), e.get("logo_url"),
                e.get("market_cap"), e.get("sector"), e.get("industry"),
                e.get("country"), e.get("city"), e.get("state"),
                e.get("ipo_date"), e.get("isin"), e.get("cik"),
                e.get("is_etf"), e.get("is_adr"), e.get("is_fund"),
                e.get("is_actively_trading"), e.get("ceo"), e.get("employees"),
                e.get("phone"), e.get("beta"),
                e.get("enrichment_source"), e["symbol"],
            ),
        )


def upsert_asset_enrichment(e: dict) -> None:
    """Write enrichment columns for one asset row."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            """
            UPDATE assets SET
                description        = %s,
                website            = %s,
                logo_url           = %s,
                market_cap         = %s,
                coingecko_id       = %s,
                hashing_algorithm  = %s,
                genesis_date       = %s,
                categories         = %s,
                whitepaper_url     = %s,
                github_url         = %s,
                circulating_supply = %s,
                total_supply       = %s,
                max_supply         = %s,
                market_cap_rank    = %s,
                ath_usd            = %s,
                ath_date           = %s,
                atl_usd            = %s,
                atl_date           = %s,
                enriched_at        = now(),
                enrichment_source  = %s
            WHERE symbol = %s
            """,
            (
                e.get("description"), e.get("website"), e.get("logo_url"),
                e.get("market_cap"), e.get("coingecko_id"),
                e.get("hashing_algorithm"), e.get("genesis_date"),
                e.get("categories"), e.get("whitepaper_url"), e.get("github_url"),
                e.get("circulating_supply"), e.get("total_supply"),
                e.get("max_supply"), e.get("market_cap_rank"),
                e.get("ath_usd"), e.get("ath_date"),
                e.get("atl_usd"), e.get("atl_date"),
                e.get("enrichment_source"), e["symbol"],
            ),
        )
