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
