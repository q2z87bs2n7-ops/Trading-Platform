"""Financial Modeling Prep — stock profile enrichment (stable endpoint).

Single-symbol only: ``profile-bulk`` and the constituent lists 402 below the
higher tiers. On the paid **Starter** plan the ceiling is 300/min (no 250/day
free cap), so a full-universe re-enrich is ~1.5–2.5 h, gated by per-symbol
latency rather than the rate limit. ``dcf``/``dcf_diff`` are not in the stable
profile response (separate endpoint) and stay null for now.
"""
from __future__ import annotations

import math
import re

import requests

from .config import get_settings

_BASE = "https://financialmodelingprep.com/stable"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; trading-platform/1.0)",
    "Accept": "application/json",
}
CALL_DELAY = 0.3  # courtesy spacing; Starter allows 300/min, so this isn't the ceiling


def configured() -> bool:
    return get_settings().fmp_configured


def fetch_profile(symbol: str) -> dict | None:
    """One company profile, or None if FMP has no record for the symbol.

    FMP uses a dash for class-share / exchange suffixes (``BRK.B`` -> ``BRK-B``)
    where Alpaca uses a dot, so the dotted form returns ``[]``. Translate for
    the query only; the caller still stores the row under the Alpaca symbol.
    """
    r = requests.get(
        f"{_BASE}/profile",
        params={"symbol": symbol.replace(".", "-"), "apikey": get_settings().fmp_api_key},
        headers=_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    arr = r.json() or []
    return arr[0] if arr else None


def fetch_profile_raw(fmp_ticker: str) -> dict | None:
    """Fetch a profile using the ticker exactly as given — no dot-to-dash
    substitution.  Used for exchange-suffixed tickers like ``SAP.DE`` or
    ``ASML.AS`` where the ``.`` is part of the FMP symbol, not an Alpaca
    class-share separator."""
    r = requests.get(
        f"{_BASE}/profile",
        params={"symbol": fmp_ticker, "apikey": get_settings().fmp_api_key},
        headers=_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    arr = r.json() or []
    return arr[0] if arr else None


# FXCM stock CFD suffix → FMP exchange suffix.
# None means no suffix (bare ticker is the primary form, e.g. .us → RBLX).
# Non-US entries try bare ticker first (covers US ADRs like ASML, SAP, TSM)
# then fall back to the exchange-suffixed form for local-only listings.
_FXCM_SUFFIX_TO_FMP_EXCHANGE: dict[str, str | None] = {
    "us":  None,
    "ext": None,   # FXCM 24-hour US stock CFD variant — same underlying as .us
    "ca": "TO",
    "de": "DE",
    "fr": "PA",
    "it": "MI",
    "es": "MC",
    "uk": "L",
    "hk": "HK",
    "jp": "T",
    "au": "AX",
    "nl": "AS",
    "ch": "SW",
}

_CFD_SUFFIX_RE = re.compile(r"^(.+)\.([a-z]{2,3})$")


def fxcm_stock_to_fmp_candidates(fxcm_name: str) -> list[str]:
    """Return an ordered list of FMP tickers to try for a FXCM stock CFD symbol.

    Returns an empty list when ``fxcm_name`` is not a stock CFD (no ``.cc``
    suffix, e.g. forex pairs, indices).  The first candidate is always the bare
    ticker (covers US ADRs); non-``.us`` symbols get a second candidate with
    the home-exchange suffix as a fallback for local-only listings.

    Examples::
        fxcm_stock_to_fmp_candidates("RBLX.us")  -> ["RBLX"]
        fxcm_stock_to_fmp_candidates("ASML.nl")  -> ["ASML", "ASML.AS"]
        fxcm_stock_to_fmp_candidates("BAYER.de") -> ["BAYER", "BAYER.DE"]
        fxcm_stock_to_fmp_candidates("EUR/USD")  -> []
    """
    m = _CFD_SUFFIX_RE.match(fxcm_name)
    if not m:
        return []
    base, cc = m.group(1), m.group(2)
    fmp_sfx = _FXCM_SUFFIX_TO_FMP_EXCHANGE.get(cc)
    if fmp_sfx is None:
        return [base]
    return [base, f"{base}.{fmp_sfx}"]


def _get(path: str, params: dict) -> list:
    """One GET against the FMP stable API; always returns a list."""
    r = requests.get(
        f"{_BASE}/{path}",
        params={**params, "apikey": get_settings().fmp_api_key},
        headers=_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    data = r.json()
    return data if isinstance(data, list) else []


def fetch_earnings_calendar(from_date: str, to_date: str) -> list[dict]:
    """Whole-market earnings calendar for a date window (YYYY-MM-DD)."""
    return _get("earnings-calendar", {"from": from_date, "to": to_date})


def fetch_symbol_earnings(symbol: str, limit: int = 8) -> list[dict]:
    """Recent + upcoming earnings for one ticker (dot->dash like fetch_profile)."""
    return _get("earnings", {"symbol": symbol.replace(".", "-"), "limit": limit})


def fetch_economic_calendar(from_date: str, to_date: str) -> list[dict]:
    """Global macro economic releases for a date window (YYYY-MM-DD)."""
    return _get("economic-calendar", {"from": from_date, "to": to_date})


def _int(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


# ---- annual fundamentals (Starter tier: annual-only, 5yr) -------------------

def fetch_income_statement(symbol: str, limit: int = 5) -> list[dict]:
    """Annual income statements, newest-first (dot->dash like fetch_profile)."""
    return _get("income-statement", {"symbol": symbol.replace(".", "-"), "limit": limit})


def fetch_cash_flow(symbol: str, limit: int = 5) -> list[dict]:
    """Annual cash-flow statements, newest-first."""
    return _get("cash-flow-statement", {"symbol": symbol.replace(".", "-"), "limit": limit})


def fetch_ratios(symbol: str, limit: int = 1) -> list[dict]:
    """Annual financial ratios, newest-first."""
    return _get("ratios", {"symbol": symbol.replace(".", "-"), "limit": limit})


def _num(v):
    """Coerce to float; None on bad/NaN/inf input."""
    try:
        f = float(v)
    except (TypeError, ValueError):
        return None
    return None if (math.isnan(f) or math.isinf(f)) else f


def _pick(d: dict, *keys: str):
    """First numeric value among candidate keys. FMP's stable field names vary
    between endpoints/versions, so each metric lists its known aliases."""
    for k in keys:
        v = _num(d.get(k))
        if v is not None:
            return v
    return None


def _fiscal_year(row: dict) -> int | None:
    for k in ("fiscalYear", "calendarYear"):
        v = row.get(k)
        if v:
            try:
                return int(str(v)[:4])
            except (TypeError, ValueError):
                pass
    try:
        return int(str(row.get("date") or "")[:4])
    except (TypeError, ValueError):
        return None


def map_fundamentals(
    symbol: str, income: list[dict], cash: list[dict], ratios: list[dict]
) -> dict | None:
    """Build one fundamentals row from the three FMP statement responses.

    Margins and YoY growth are *derived* from the income statement (well-known
    fields) rather than the ratios endpoint, whose stable field names are less
    certain; valuation/quality ratios come from `ratios` with alias fallbacks.
    Missing metrics stay None and the widget hides them — never fabricated.
    """
    if not income:
        return None
    inc0 = income[0]
    fcf_by_year = {
        y: _pick(c, "freeCashFlow")
        for c in (cash or [])
        if (y := _fiscal_year(c)) is not None
    }

    trend: list[dict] = []
    for row in income[:5]:
        y = _fiscal_year(row)
        if y is None:
            continue
        trend.append({
            "year":       y,
            "revenue":    _pick(row, "revenue"),
            "net_income": _pick(row, "netIncome"),
            "eps":        _pick(row, "epsDiluted", "epsdiluted", "eps"),
            "fcf":        fcf_by_year.get(y),
        })

    rev0 = _pick(inc0, "revenue")
    def _margin(*keys):
        n = _pick(inc0, *keys)
        return (n / rev0) if (n is not None and rev0) else None

    def _growth(field):
        if len(trend) >= 2:
            a, b = trend[0].get(field), trend[1].get(field)
            if a is not None and b is not None and b > 0:
                return a / b - 1
        return None

    r = ratios[0] if ratios else {}
    head = trend[0] if trend else {}
    return {
        "symbol":               symbol,
        "pe_ratio":             _pick(r, "priceToEarningsRatio", "peRatio", "priceEarningsRatio"),
        "ps_ratio":             _pick(r, "priceToSalesRatio", "priceSalesRatio"),
        "pb_ratio":             _pick(r, "priceToBookRatio", "priceBookValueRatio", "priceToBookValueRatio"),
        "ev_to_ebitda":         _pick(r, "enterpriseValueMultiple", "evToEBITDA", "enterpriseValueOverEBITDA"),
        "peg_ratio":            _pick(r, "priceToEarningsGrowthRatio", "pegRatio", "priceEarningsToGrowthRatio"),
        "gross_margin":         _margin("grossProfit") if rev0 else _pick(r, "grossProfitMargin"),
        "operating_margin":     _margin("operatingIncome") if rev0 else _pick(r, "operatingProfitMargin"),
        "net_margin":           _margin("netIncome") if rev0 else _pick(r, "netProfitMargin", "netIncomeMargin"),
        "roe":                  _pick(r, "returnOnEquity"),
        "roic":                 _pick(r, "returnOnInvestedCapital", "returnOnCapitalEmployed"),
        "debt_to_equity":       _pick(r, "debtToEquityRatio", "debtEquityRatio"),
        "current_ratio":        _pick(r, "currentRatio"),
        "eps_diluted":          head.get("eps"),
        "book_value_per_share": _pick(r, "bookValuePerShare"),
        "free_cash_flow":       head.get("fcf"),
        "revenue_growth_yoy":   _growth("revenue"),
        "eps_growth_yoy":       _growth("eps"),
        "dividend_yield":       _pick(r, "dividendYield", "dividendYieldRatio"),
        "payout_ratio":         _pick(r, "dividendPayoutRatio", "payoutRatio"),
        "latest_fiscal_year":   head.get("year"),
        "reported_currency":    inc0.get("reportedCurrency") or None,
        "financials_annual":    trend,
    }


def map_stock_enrichment(symbol: str, d: dict) -> dict:
    return {
        "symbol":              symbol,
        "description":         d.get("description") or None,
        "website":             d.get("website") or None,
        "logo_url":            d.get("image") or None,
        "market_cap":          _int(d.get("marketCap")),
        "sector":              d.get("sector") or None,
        "industry":            d.get("industry") or None,
        "country":             d.get("country") or None,
        "city":                d.get("city") or None,
        "state":               d.get("state") or None,
        "ipo_date":            d.get("ipoDate") or None,
        "isin":                d.get("isin") or None,
        "cik":                 d.get("cik") or None,
        "is_etf":              d.get("isEtf"),
        "is_adr":              d.get("isAdr"),
        "is_fund":             d.get("isFund"),
        "is_actively_trading": d.get("isActivelyTrading"),
        "ceo":                 d.get("ceo") or None,
        "employees":           _int(d.get("fullTimeEmployees")),
        "phone":               d.get("phone") or None,
        "beta":                d.get("beta"),
        "enrichment_source":   "fmp",
    }
