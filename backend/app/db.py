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
import ssl
import threading
from contextlib import contextmanager
from urllib.parse import unquote, urlparse

import pg8000.dbapi

from .config import get_settings

_log = logging.getLogger(__name__)

_SCHEMA_SQL = """
create table if not exists company_profiles (
    symbol       text primary key,
    name         text,
    exchange     text,
    sector       text,
    industry     text,
    market_cap   bigint,
    description  text,
    website      text,
    employees    integer,
    logo_url     text,
    fundamentals jsonb       not null default '{}'::jsonb,
    updated_at   timestamptz not null default now()
)
"""

_COLS = (
    "symbol", "name", "exchange", "sector", "industry", "market_cap",
    "description", "website", "employees", "logo_url", "fundamentals",
    "updated_at",
)

_schema_ready = False
_schema_lock = threading.Lock()


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


def _ensure_schema(cur) -> None:
    global _schema_ready
    if _schema_ready:
        return
    with _schema_lock:
        if _schema_ready:
            return
        cur.execute(_SCHEMA_SQL)
        _schema_ready = True


def diagnostics() -> dict:
    """Temporary dev probe — report whether the DB is configured and reachable,
    creating the schema as a side effect. Never raises; status is returned as
    data so a diagnostic endpoint can render it. The password is never exposed.
    """
    out: dict = {"configured": db_enabled()}
    if not out["configured"]:
        return out
    u = urlparse(get_settings().database_url)
    out["host"], out["port"] = u.hostname, u.port or 5432
    try:
        with _connect() as conn:
            cur = conn.cursor()
            _ensure_schema(cur)
            cur.execute("select version()")
            out["server_version"] = cur.fetchone()[0]
            cur.execute("select count(*) from company_profiles")
            out["row_count"] = cur.fetchone()[0]
        out["reachable"] = True
    except DbUnavailable as exc:
        out["reachable"] = False
        out["error"] = str(exc)
    except Exception as exc:  # connected, but a query/DDL failed
        out["reachable"] = True
        out["error"] = f"query failed: {exc}"
    return out


def fetch_profile(symbol: str) -> dict | None:
    with _connect() as conn:
        cur = conn.cursor()
        _ensure_schema(cur)
        cur.execute(
            "select " + ", ".join(_COLS) + " from company_profiles where symbol = %s",
            (symbol,),
        )
        row = cur.fetchone()
        if row is None:
            return None
        return dict(zip(_COLS, row))


def upsert_profile(profile: dict) -> None:
    fundamentals = json.dumps(profile.get("fundamentals") or {})
    values = (
        profile.get("symbol"),
        profile.get("name"),
        profile.get("exchange"),
        profile.get("sector"),
        profile.get("industry"),
        profile.get("market_cap"),
        profile.get("description"),
        profile.get("website"),
        profile.get("employees"),
        profile.get("logo_url"),
        fundamentals,
    )
    with _connect() as conn:
        cur = conn.cursor()
        _ensure_schema(cur)
        cur.execute(
            """
            insert into company_profiles
                (symbol, name, exchange, sector, industry, market_cap,
                 description, website, employees, logo_url, fundamentals,
                 updated_at)
            values (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s::jsonb, now())
            on conflict (symbol) do update set
                name         = excluded.name,
                exchange     = excluded.exchange,
                sector       = excluded.sector,
                industry     = excluded.industry,
                market_cap   = excluded.market_cap,
                description  = excluded.description,
                website      = excluded.website,
                employees    = excluded.employees,
                logo_url     = excluded.logo_url,
                fundamentals = excluded.fundamentals,
                updated_at   = now()
            """,
            values,
        )
