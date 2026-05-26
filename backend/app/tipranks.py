"""Tipranks research API client.

Per-request research data (consensus, smart-score, sentiment, hedge-fund
flow, insider activity, holder demographics, related tickers)
live-proxied with an in-process cache. Not part of the asset catalogue —
never persisted to Postgres. Auth is via query-string params (despite
the ``X-`` prefix on the names), so both ``X-APIKey`` and
``X-APIToken`` go on every request.

Each endpoint has its own TTL chosen against the underlying update
cadence (trending: 15min, smart-score / overview: hourly — analyst
ratings tick irregularly). Each widget keeps its own price source per
the design call — don't unify ``averagePriceTarget`` (trending) with
``priceTarget`` (smartScore / overview).

The InvestorSentiment endpoint backs THREE consumers (Sentiment,
RelatedTickers, HolderDemographics); a shared raw cache means one
network round-trip serves all three.
"""
from __future__ import annotations

import logging
import time

import requests

from .config import get_settings

_log = logging.getLogger(__name__)

_BASE = "https://api.tipranks.com"
_HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; trading-platform/1.0)",
    "Accept": "application/json",
}

_TRENDING_TTL = 900       # 15min — list moves with new analyst coverage, not intraday
_OVERVIEW_TTL = 3600      # 1h — consensus + PT shifts when analysts update (irregular)
_SMART_SCORE_TTL = 3600   # 1h — composite recomputed daily upstream; 1h keeps it responsive
_SENTIMENT_TTL = 1800     # 30min — news sentiment shifts with breaking stories
_INVESTOR_TTL = 1800      # 30min — shared by Sentiment + RelatedTickers + HolderDemographics
_ANALYSTS_TTL = 3600      # 1h — rating events tick irregularly
_HEDGEFUNDS_TTL = 21600   # 6h — 13F filings are quarterly; 6h is generous
_INSIDERS_TTL = 14400     # 4h — Form 4 filings within 2 business days of txn

_trending: list[dict] = []
_trending_ts: float = 0.0
_overview: dict[str, dict] = {}
_overview_ts: dict[str, float] = {}
_smart_score: dict[str, dict] = {}
_smart_score_ts: dict[str, float] = {}
_sentiment: dict[str, dict] = {}
_sentiment_ts: dict[str, float] = {}
_investor_raw: dict[str, dict] = {}           # raw upstream InvestorSentiment payload
_investor_raw_ts: dict[str, float] = {}
_analysts: dict[str, list[dict]] = {}
_analysts_ts: dict[str, float] = {}
_hedgefunds: dict[str, dict] = {}
_hedgefunds_ts: dict[str, float] = {}
_insiders: dict[str, dict] = {}
_insiders_ts: dict[str, float] = {}


def configured() -> bool:
    s = get_settings()
    return bool(s.tipranks_api_key and s.tipranks_api_token)


def _auth_params() -> dict:
    s = get_settings()
    return {"X-APIKey": s.tipranks_api_key, "X-APIToken": s.tipranks_api_token}


def _get(path: str, params: dict | None = None) -> list | dict:
    """One GET against the Tipranks API."""
    r = requests.get(
        f"{_BASE}{path}",
        params={**(params or {}), **_auth_params()},
        headers=_HEADERS,
        timeout=15,
    )
    r.raise_for_status()
    return r.json()


def _f(v) -> float | None:
    try:
        return float(v)
    except (TypeError, ValueError):
        return None


# ── trending ────────────────────────────────────────────────────────────────

def _norm_trending(r: dict) -> dict:
    return {
        "ticker": (r.get("ticker") or "").upper(),
        "company_name": r.get("companyName"),
        "sector": r.get("sector"),
        "popularity": r.get("popularity"),
        "sentiment": r.get("sentiment"),
        "buy": r.get("buy"),
        "hold": r.get("hold"),
        "sell": r.get("sell"),
        "consensus": r.get("consensus"),
        "average_price_target": _f(r.get("averagePriceTarget")),
        "market_cap": r.get("marketCap"),
        "market_name": r.get("marketName"),
        "last_rating_date": r.get("lastRatingDate"),
        "low_price_target": None,
        "high_price_target": None,
        "total_analysts": None,
        # Enrichment from stocks/overview — kept additive, NOT replacing avg PT
        "price_target_upside": None,
    }


def get_trending_stocks() -> list[dict]:
    """Top trending stocks by analyst coverage (whole-market, equities).
    Enriched with PT range + analyst count + upside % from ``stocks/overview``."""
    global _trending, _trending_ts
    if not configured():
        return []
    now = time.time()
    if _trending and (now - _trending_ts) < _TRENDING_TTL:
        return _trending
    try:
        raw = _get("/api/stocks/trendingStocks")
        rows = raw if isinstance(raw, list) else []
        normed = [_norm_trending(r) for r in rows if r.get("ticker")]
        tickers = [r["ticker"] for r in normed]
        if tickers:
            try:
                ov = _fetch_overview_batch(tickers)
                by_ticker = {o["ticker"]: o for o in ov}
                for row in normed:
                    o = by_ticker.get(row["ticker"])
                    if o:
                        row["low_price_target"] = o.get("low_price_target")
                        row["high_price_target"] = o.get("high_price_target")
                        row["total_analysts"] = o.get("total_analysts")
                        row["price_target_upside"] = o.get("price_target_upside")
            except Exception as exc:
                _log.warning("tipranks overview enrichment failed: %s", exc)
        _trending = normed
        _trending_ts = now
    except Exception as exc:
        _log.warning("tipranks trending fetch failed: %s", exc)
    return _trending


# ── overview (analyst consensus + PT range) ─────────────────────────────────

def _norm_overview(r: dict) -> dict:
    return {
        "ticker": (r.get("ticker") or "").upper(),
        "company_name": r.get("companyName"),
        "consensus": r.get("consensus"),
        "price_target": _f(r.get("priceTarget")),
        "low_price_target": _f(r.get("lowPriceTarget")),
        "high_price_target": _f(r.get("highPriceTarget")),
        "price_target_upside": _f(r.get("priceTargetUpside")),
        "buy": r.get("buy"),
        "hold": r.get("hold"),
        "sell": r.get("sell"),
        "total_analysts": r.get("totalAnalysts"),
        "market_name": r.get("marketName"),
    }


def _fetch_overview_batch(symbols: list[str]) -> list[dict]:
    if not symbols:
        return []
    csv = ",".join(s.upper() for s in symbols)
    raw = _get(f"/api/stocks/overview/{csv}")
    return [_norm_overview(r) for r in (raw if isinstance(raw, list) else [])]


# ── smart score (composite + text labels + technicals) ──────────────────────

def _norm_smart_score(r: dict) -> dict:
    """Tipranks composite signal (1–10) + numeric components + companion
    TEXT LABELS per component (Bullish/Neutral/Bearish etc.). The widget
    pairs the numeric with its label as a same-row suffix. ``fundamentals_*``
    fields are kept in the payload for AI tool answers but hidden in the
    SmartScore widget UI since the Fundamentals widget owns those metrics."""
    return {
        "ticker": (r.get("ticker") or "").upper(),
        "smart_score": r.get("smartScore"),
        "price_target": _f(r.get("priceTarget")),
        "price_target_currency_code": r.get("priceTargetCurrencyCode"),
        # Numeric components
        "hedge_fund_trend_value": _f(r.get("hedgeFundTrendValue")),
        "blogger_bullish_sentiment": _f(r.get("bloggerBullishSentiment")),
        "blogger_sector_avg": _f(r.get("bloggerSectorAvg")),
        "insiders_last_3_months_sum": _f(r.get("insidersLast3MonthsSum")),
        "news_sentiments_bullish_percent": _f(r.get("newsSentimentsBullishPercent")),
        "news_sentiments_bearish_percent": _f(r.get("newsSentimentsBearishPercent")),
        "investor_holding_change_last_7_days": _f(r.get("investorHoldingChangeLast7Days")),
        "investor_holding_change_last_30_days": _f(r.get("investorHoldingChangeLast30Days")),
        "fundamentals_return_on_equity": _f(r.get("fundamentalsReturnOnEquity")),
        "fundamentals_asset_growth": _f(r.get("fundamentalsAssetGrowth")),
        "technicals_twelve_months_momentum": _f(r.get("technicalsTwelveMonthsMomentum")),
        # Text-label companion signals (NEW — paired with the numerics above)
        "sma": r.get("sma"),
        "analyst_consensus": r.get("analystConsensus"),
        "hedge_fund_trend": r.get("hedgeFundTrend"),
        "insider_trend": r.get("insiderTrend"),
        "investor_sentiment": r.get("investorSentiment"),
        "news_sentiment": r.get("newsSentiment"),
        "blogger_consensus": r.get("bloggerConsensus"),
    }


def get_smart_score(symbol: str) -> dict | None:
    if not configured():
        return None
    sym = symbol.upper()
    now = time.time()
    cached = _smart_score.get(sym)
    if cached is not None and (now - _smart_score_ts.get(sym, 0.0)) < _SMART_SCORE_TTL:
        return cached
    try:
        raw = _get(f"/api/smartScore/{sym}")
        arr = raw if isinstance(raw, list) else []
        if not arr:
            return cached
        row = _norm_smart_score(arr[0])
        _smart_score[sym] = row
        _smart_score_ts[sym] = now
        return row
    except Exception as exc:
        _log.warning("tipranks smart-score fetch failed for %s: %s", sym, exc)
        return cached


# ── investor sentiment (shared cache for 3 consumers) ───────────────────────

def _get_investor_raw(symbol: str) -> dict | None:
    """Single fetch + cache for ``/Stocks/InvestorSentiment``. Used by
    Sentiment + RelatedTickers + HolderDemographics so we make one network
    round-trip per TTL even when all three widgets are mounted."""
    if not configured():
        return None
    sym = symbol.upper()
    now = time.time()
    cached = _investor_raw.get(sym)
    if cached is not None and (now - _investor_raw_ts.get(sym, 0.0)) < _INVESTOR_TTL:
        return cached
    try:
        raw = _get(f"/api/Stocks/InvestorSentiment/{sym}")
        if isinstance(raw, dict):
            _investor_raw[sym] = raw
            _investor_raw_ts[sym] = now
            return raw
    except Exception as exc:
        _log.warning("tipranks investor raw fetch failed for %s: %s", sym, exc)
    return cached


# ── sentiment (combined blogger + news + investor) ──────────────────────────

def _norm_blogger(r: dict | None) -> dict:
    r = r or {}
    return {
        "bullish_ratio": _f(r.get("bullishRatio")),
        "bearish_ratio": _f(r.get("bearishRatio")),
        "sector_bull_ratio": _f(r.get("sectorBullRatio")),
        "blogs_distribution": [
            {"site": b.get("site"), "percentage": _f(b.get("percentage"))}
            for b in (r.get("blogsDistribution") or [])
            if b.get("site")
        ],
    }


def _norm_news_sentiment(r: dict | None) -> dict:
    """Flatten ``newsSentiment.{stockSentiment, sectorSentiment, counts}`` +
    sibling blocks (``newsScore``, ``wordCloud``, ``newsBuzz``,
    ``bullishBearish``) into a flat shape."""
    r = r or {}
    inner = r.get("newsSentiment") or {}
    stock = inner.get("stockSentiment") or {}
    sector = inner.get("sectorSentiment") or {}
    counts = inner.get("counts") or []
    score = r.get("newsScore") or {}
    buzz = r.get("newsBuzz") or {}
    bb = r.get("bullishBearish") or {}
    return {
        "stock": {
            "positive": _f(stock.get("positive")),
            "neutral": _f(stock.get("neutral")),
            "negative": _f(stock.get("negative")),
        },
        "sector": {
            "positive": _f(sector.get("positive")),
            "neutral": _f(sector.get("neutral")),
            "negative": _f(sector.get("negative")),
        },
        "counts": [
            {
                "week_start": c.get("weekStart"),
                "buy": c.get("buy"),
                "sell": c.get("sell"),
                "neutral": c.get("neutral"),
                "all": c.get("all"),
            }
            for c in counts
        ],
        "score": {
            "stock_score": score.get("stockScore"),
            "stock_score_value": _f(score.get("stockScoreValue")),
            "sector_score": _f(score.get("sectorScore")),
        },
        "buzz": {
            "weekly_average": _f(buzz.get("weeklyAverage")),
            "this_week": buzz.get("thisWeek"),
            "buzz": _f(buzz.get("buzz")),
        },
        "bullish_bearish": {
            "stock_bullish": _f(bb.get("stockBullish")),
            "stock_bearish": _f(bb.get("stockBearish")),
            "sector_bullish": _f(bb.get("sectorBullish")),
            "sector_bearish": _f(bb.get("sectorBearish")),
        },
        "word_cloud": list(r.get("wordCloud") or []),
    }


def _norm_investor_block(r: dict | None) -> dict:
    """Sentiment-widget-facing slice: overview + best subset only.
    ``ageDistribution`` and ``investorsAlsoBought`` live in their own
    widgets (HolderDemographics + RelatedTickers), so we don't bloat
    Sentiment with them."""
    r = r or {}
    s = r.get("investorStatsOverview") or {}
    b = r.get("bestInvestorStatsOverview") or {}
    return {
        "number_of_portfolios": s.get("numberOfPortfolios"),
        "portfolios_holding_stock": s.get("portfoliosHoldingStock"),
        "average_allocation": _f(s.get("averageAllocation")),
        "percent_over_last_7_days": _f(s.get("percentOverLast7Days")),
        "percent_over_last_30_days": _f(s.get("percentOverLast30Days")),
        "investor_score": _f(s.get("investorScore")),
        "sector_average_score": _f(s.get("sectorAverageScore")),
        "sentiment": s.get("sentiment"),
        "sector_average_sentiment": s.get("sectorAverageSentiment"),
        "best": {
            "portfolios_holding_stock": b.get("portfoliosHoldingStock"),
            "average_allocation": _f(b.get("averageAllocation")),
            "percent_over_last_7_days": _f(b.get("percentOverLast7Days")),
            "percent_over_last_30_days": _f(b.get("percentOverLast30Days")),
            "investor_score": _f(b.get("investorScore")),
        },
    }


def get_sentiment_signals(symbol: str) -> dict | None:
    """Combined blogger + news + investor sentiment. The investor slice is
    fetched via the shared ``_get_investor_raw`` cache so three widgets
    backed by the same upstream call cost one round-trip."""
    if not configured():
        return None
    sym = symbol.upper()
    now = time.time()
    cached = _sentiment.get(sym)
    if cached is not None and (now - _sentiment_ts.get(sym, 0.0)) < _SENTIMENT_TTL:
        return cached

    blogger_raw: dict | None = None
    news_raw: dict | None = None
    investor_raw: dict | None = None
    any_ok = False
    for path, store in (
        (f"/api/stocks/bloggerConsensus/{sym}", "blogger"),
        (f"/api/stocks/newsSentiment/{sym}", "news"),
    ):
        try:
            res = _get(path)
            any_ok = True
            if store == "blogger":
                blogger_raw = res if isinstance(res, dict) else None
            else:
                news_raw = res if isinstance(res, dict) else None
        except Exception as exc:
            _log.warning("tipranks sentiment %s fetch failed for %s: %s", store, sym, exc)

    investor_raw = _get_investor_raw(sym)
    if investor_raw is not None:
        any_ok = True

    if not any_ok:
        return cached

    row = {
        "ticker": sym,
        "blogger": _norm_blogger(blogger_raw),
        "news": _norm_news_sentiment(news_raw),
        "investor": _norm_investor_block(investor_raw),
    }
    _sentiment[sym] = row
    _sentiment_ts[sym] = now
    return row


# ── related tickers (investorsAlsoBought + cohort variants) ─────────────────

def _norm_related_ticker(r: dict) -> dict:
    return {
        "ticker": (r.get("ticker") or "").upper(),
        "company_name": r.get("companyName"),
        "sector": r.get("sector"),
        "sector_name": r.get("sectorName"),
        "average_holding_size": _f(r.get("averageHoldingSize")),
        "last_seven_day_change": _f(r.get("lastSevenDayChange")),
        "last_thirty_day_change": _f(r.get("lastThirtyDayChange")),
        "score": _f(r.get("score")),
        "sentiment": r.get("sentiment"),
        "market_cap": r.get("marketCap"),
        "market_cap_currency_code": r.get("marketCapCurrencyCode"),
    }


def get_related_tickers(symbol: str) -> dict | None:
    """Tickers also held by investors who hold ``symbol``, split by age cohort."""
    raw = _get_investor_raw(symbol)
    if raw is None:
        return None
    return {
        "ticker": symbol.upper(),
        "all": [_norm_related_ticker(r) for r in (raw.get("investorsAlsoBought") or [])],
        "youngest": [_norm_related_ticker(r) for r in (raw.get("investorsAlsoBoughtYoungest") or [])],
        "mid_range": [_norm_related_ticker(r) for r in (raw.get("investorsAlsoBoughtMidRange") or [])],
        "eldest": [_norm_related_ticker(r) for r in (raw.get("investorsAlsoBoughtEldest") or [])],
    }


# ── holder demographics (ageDistribution + best vs sector footer) ───────────

def _norm_cohort(r: dict | None) -> dict:
    r = r or {}
    return {
        "percent_holders": _f(r.get("percentHolders")),
        "last_7_days_change": _f(r.get("last7DaysChange")),
        "last_30_days_change": _f(r.get("last30DaysChange")),
        "average_beta": _f(r.get("averageBeta")),
        "average_monthly_return": _f(r.get("averageMonthlyReturn")),
        "dividend_yield": _f(r.get("dividendYield")),
        "average_pe_ratio": _f(r.get("averagePeRatio")),
    }


def get_holder_demographics(symbol: str) -> dict | None:
    """Per-cohort behavioural profile of the stock's holder base
    (eldest / midRange / youngest) — % holders, 7d/30d activity, beta,
    monthly return, dividend yield, P/E. Plus a sector + best-investor
    benchmark footer."""
    raw = _get_investor_raw(symbol)
    if raw is None:
        return None
    age = raw.get("ageDistribution") or {}
    s = raw.get("investorStatsOverview") or {}
    b = raw.get("bestInvestorStatsOverview") or {}
    return {
        "ticker": symbol.upper(),
        "eldest": _norm_cohort(age.get("eldest")),
        "mid_range": _norm_cohort(age.get("midRange")),
        "youngest": _norm_cohort(age.get("youngest")),
        "sector_average_score": _f(s.get("sectorAverageScore")),
        "sector_average_sentiment": s.get("sectorAverageSentiment"),
        "best_investors_score": _f(b.get("investorScore")),
        "best_investors_holding": b.get("portfoliosHoldingStock"),
        "best_investors_allocation": _f(b.get("averageAllocation")),
    }


# ── analyst ratings (per-analyst rows) ──────────────────────────────────────

def _norm_analyst(r: dict) -> dict:
    """Per-analyst row — captures the per-stock track record fields
    (`stockSuccessRate` / `stockAvgReturn`) which beat the overall versions,
    the analyst's own `priceTarget`, the `analystAction` chip
    (upgraded / downgraded / initiated / maintained), and the article link."""
    return {
        "analyst_name": r.get("analystName"),
        "firm_name": r.get("firmName"),
        "recommendation": r.get("recommendation"),
        "recommendation_date": r.get("recommendationDate"),
        "expert_uid": r.get("expertUID"),
        "url": r.get("url"),
        "url_slug": r.get("urlSlug"),
        "article_title": r.get("articleTitle"),
        "analyst_action": r.get("analystAction"),
        # Reputation
        "analyst_rank": r.get("analystRank"),
        "number_of_ranked_experts": r.get("numberOfRankedExperts"),
        "num_of_stars": _f(r.get("numOfStars")),
        # Per-stock track record (preferred over overall — drops the noise)
        "stock_success_rate": _f(r.get("stockSuccessRate")),
        "stock_avg_return": _f(r.get("stockAvgReturn")),
        "stock_total_recommendations": r.get("stockTotalRecommendations"),
        "stock_good_recommendations": r.get("stockGoodRecommendations"),
        # Price target
        "price_target": _f(r.get("priceTarget")),
        "price_target_currency_code": r.get("priceTargetCurrencyCode"),
    }


def get_analyst_ratings(symbol: str) -> list[dict]:
    if not configured():
        return []
    sym = symbol.upper()
    now = time.time()
    cached = _analysts.get(sym)
    if cached is not None and (now - _analysts_ts.get(sym, 0.0)) < _ANALYSTS_TTL:
        return cached
    try:
        raw = _get(f"/api/analysts/{sym}")
        rows = raw if isinstance(raw, list) else []
        rows = [_norm_analyst(r) for r in rows if r.get("analystName")]
        _analysts[sym] = rows
        _analysts_ts[sym] = now
        return rows
    except Exception as exc:
        _log.warning("tipranks analysts fetch failed for %s: %s", sym, exc)
        return cached or []


# ── hedge funds (13F filings) ───────────────────────────────────────────────

def _norm_hedge_holding(r: dict) -> dict:
    return {
        "date": r.get("date"),
        "shares_held": r.get("sharesHeld"),
        "net_shares_change": r.get("netSharesChange"),
        "number_of_shares_bought": r.get("numberOfSharesBought"),
        "number_of_shares_sold": r.get("numberOfSharesSold"),
    }


def _norm_hedge_fund(r: dict) -> dict:
    """One fund's institutional holding row. ``action`` is pre-classified
    by Tipranks (New Position / Closed Position / Added / Reduced /
    Maintained) — use verbatim rather than infer from share-delta sign."""
    return {
        "manager_name": r.get("managerName"),
        "institution_name": r.get("institutionName"),
        "reported_value": r.get("reportedValue"),
        "remaining_shares": r.get("adjRemainingShares"),
        "holding_change": _f(r.get("holdingChange")),
        "shares_traded": r.get("sharesTraded"),
        "percentage_of_portfolio": _f(r.get("percentageOfPortfolio")),
        "hedge_fund_rank": r.get("hedgeFundRank"),
        "number_of_ranked_hedge_funds": r.get("numberOfRankedHedgeFunds"),
        "is_active_investor": r.get("isActiveInvestor"),
        "action": r.get("action"),
        "stars": _f(r.get("stars")),
        "expert_uid": r.get("expertUID"),
    }


def get_hedge_funds(symbol: str) -> dict | None:
    if not configured():
        return None
    sym = symbol.upper()
    now = time.time()
    cached = _hedgefunds.get(sym)
    if cached is not None and (now - _hedgefunds_ts.get(sym, 0.0)) < _HEDGEFUNDS_TTL:
        return cached
    try:
        raw = _get(f"/api/hedgefunds/{sym}")
        if not isinstance(raw, dict):
            return cached
        signal = raw.get("signalData") or {}
        holding_data = raw.get("holdingData") or {}
        row = {
            "ticker": sym,
            "last_q_shares_traded": _f(raw.get("lastQSharesTraded")),
            "signal": {
                "rating": signal.get("rating"),
                "sentiment": _f(signal.get("sentiment")),
                "confidence": signal.get("confidence"),
                "based_on_num_hedge_funds": signal.get("basedOnNumHedgeFunds"),
            },
            "total_hedge_funds": holding_data.get("totalHedgeFunds"),
            "holdings_history": [
                _norm_hedge_holding(h) for h in (holding_data.get("holdings") or [])
            ],
            "institutional_holdings": [
                _norm_hedge_fund(f) for f in (raw.get("institutionalHoldings") or [])
            ],
        }
        _hedgefunds[sym] = row
        _hedgefunds_ts[sym] = now
        return row
    except Exception as exc:
        _log.warning("tipranks hedgefunds fetch failed for %s: %s", sym, exc)
        return cached


# ── insiders (Form 4 filings) ───────────────────────────────────────────────

def _norm_monthly_insider(r: dict) -> dict:
    """Monthly bucket. Carries both all-in and discretionary decomposition
    so the widget can overlay the informative-only signal on the baseline."""
    return {
        "year": r.get("year"),
        "month": r.get("month"),
        "buy_count": r.get("buyCount"),
        "buy_amount": _f(r.get("buyAmount")),
        "sell_count": r.get("sellCount"),
        "sell_amount": _f(r.get("sellAmount")),
        "discretionary_buy_count": r.get("discretionaryBuyCount"),
        "discretionary_buy_amount": _f(r.get("discretionaryBuyAmount")),
        "discretionary_sell_count": r.get("discretionarySellCount"),
        "discretionary_sell_amount": _f(r.get("discretionarySellAmount")),
    }


def _norm_insider_txn(r: dict) -> dict:
    """Transaction row. Dates upstream are DD/MM/YYYY (UK). ``stars`` can
    be string ('Not Ranked') or float — _f() handles both. ``transaction``
    string encodes Informative vs Uninformative + Buy vs Sell."""
    return {
        "insider_name": r.get("insiderName"),
        "position": r.get("position"),
        "transaction": r.get("transaction"),
        "amount": _f(r.get("amount")),
        "number_of_shares": r.get("numberOfShares"),
        "date": r.get("date"),
        "stars": _f(r.get("stars")),
        "form_url": r.get("formURL"),
        "expert_uid": r.get("expertUid"),
        "currency_code": r.get("currencyCode"),
    }


def get_insiders(symbol: str) -> dict | None:
    if not configured():
        return None
    sym = symbol.upper()
    now = time.time()
    cached = _insiders.get(sym)
    if cached is not None and (now - _insiders_ts.get(sym, 0.0)) < _INSIDERS_TTL:
        return cached
    try:
        raw = _get(f"/api/insiders/{sym}")
        if not isinstance(raw, dict):
            return cached
        cs = raw.get("confidenceSignal") or {}
        row = {
            "ticker": sym,
            "trend": _f(raw.get("trend")),
            "confidence_signal": {
                # NB: upstream ``score`` is a label string ("Negative Sentiment"
                # / "NA"), NOT a 0-1 float. Render as a chip.
                "score": cs.get("score"),
                "sector_score": _f(cs.get("sectorScore")),
                "stock_score": _f(cs.get("stockScore")),
            },
            "discretionary_transactions": raw.get("discretionaryTransactions"),
            "uninformative_transactions": raw.get("uninformativeTransactions"),
            "monthly": [
                _norm_monthly_insider(m)
                for m in (raw.get("yearlyInsiderTransactions") or [])
            ],
            "transactions": [
                _norm_insider_txn(t) for t in (raw.get("transactions") or [])
            ],
        }
        _insiders[sym] = row
        _insiders_ts[sym] = now
        return row
    except Exception as exc:
        _log.warning("tipranks insiders fetch failed for %s: %s", sym, exc)
        return cached
