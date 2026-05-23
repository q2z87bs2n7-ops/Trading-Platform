"""Postgres (Supabase) access via pg8000 — pure-Python, no C extensions
(Python 3.14 / Vercel safe, per docs/landmines.md).

Per-operation connections built lazily from ``DATABASE_URL`` (the Supabase
Session pooler URI; IPv4, free). DB-backed features degrade gracefully: an
unset/unreachable database raises ``DbUnavailable`` which callers swallow into
a 503-style fallback, mirroring the Alpaca-keys seam.
"""

from __future__ import annotations

import logging
import ssl
from contextlib import contextmanager
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


def get_asset(symbol: str) -> dict | None:
    """Single catalogue row (static identity + enrichment), or None if the
    symbol isn't seeded yet."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT symbol, COALESCE(name, symbol) AS name, "
            "COALESCE(exchange, '') AS exchange, asset_class, "
            "COALESCE(status, '') AS status, COALESCE(tradable, false) AS tradable, "
            "COALESCE(marginable, false) AS marginable, "
            "COALESCE(shortable, false) AS shortable, "
            "COALESCE(fractionable, false) AS fractionable, "
            "sector, logo_url, market_cap "
            "FROM assets WHERE symbol = %s",
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
    "enriched_at", "enrichment_source",
)


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
        return {k: v for k, v in zip(_PROFILE_COLS, row) if v is not None}


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
        "SELECT symbol, COALESCE(name, symbol) AS name, COALESCE(exchange, '') "
        "AS exchange, asset_class, COALESCE(status, '') AS status, tradable, "
        "COALESCE(marginable, false) AS marginable, "
        "COALESCE(shortable, false) AS shortable, "
        "COALESCE(fractionable, false) AS fractionable, "
        "sector, logo_url, market_cap "
        "FROM assets WHERE " + " AND ".join(where) +
        " ORDER BY (symbol ILIKE %s) DESC, market_cap DESC NULLS LAST, symbol "
        "LIMIT %s"
    )
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(sql, params)
        return [dict(zip(_SEARCH_COLS, row)) for row in cur.fetchall()]


def crypto_symbols() -> set[str]:
    """All crypto symbols in the catalogue — used by enrich-only seed runs."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute("SELECT symbol FROM assets WHERE asset_class = 'crypto'")
        return {row[0] for row in cur.fetchall()}


def enriched_crypto_symbols() -> set[str]:
    """Crypto symbols that already carry enrichment — lets the seeder resume."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT symbol FROM assets "
            "WHERE asset_class = 'crypto' AND enrichment_source IS NOT NULL"
        )
        return {row[0] for row in cur.fetchall()}


def enriched_stock_symbols() -> set[str]:
    """us_equity symbols already enriched — lets the stock seeder resume."""
    with _connect() as conn:
        cur = conn.cursor()
        cur.execute(
            "SELECT symbol FROM assets "
            "WHERE asset_class = 'us_equity' AND enrichment_source IS NOT NULL"
        )
        return {row[0] for row in cur.fetchall()}


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
