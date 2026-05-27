"""Market-data reads: historical bars and latest quotes."""

from datetime import datetime, timedelta, timezone

from alpaca.common.enums import Sort
from alpaca.data.requests import (
    CryptoBarsRequest,
    CryptoLatestQuoteRequest,
    CryptoSnapshotRequest,
    StockBarsRequest,
    StockLatestQuoteRequest,
    StockSnapshotRequest,
)

from .client import _feed, crypto_data_client, data_client, is_crypto, timeframe_from_str


def get_bars(symbol: str, timeframe: str, limit: int) -> list[dict]:
    # Alpaca defaults `start` to the beginning of the current day, so without an
    # explicit window every timeframe only returns today's data (one candle on
    # 1Day). Open a wide window and pull the most recent `limit` bars via
    # Sort.DESC (efficient: Alpaca pages back from `end`, capped at `limit`).
    sym = symbol.upper()
    tf = timeframe_from_str(timeframe)
    start = datetime.now(timezone.utc) - timedelta(days=2000)
    out: list[dict] = []

    if is_crypto(sym):
        req = CryptoBarsRequest(
            symbol_or_symbols=sym,
            timeframe=tf,
            start=start,
            limit=limit,
            sort=Sort.DESC,
        )
        bars = crypto_data_client().get_crypto_bars(req)
    else:
        req = StockBarsRequest(
            symbol_or_symbols=sym,
            timeframe=tf,
            start=start,
            limit=limit,
            feed=_feed(),
            sort=Sort.DESC,
        )
        bars = data_client().get_stock_bars(req)

    for bar in bars.data.get(sym, []):
        out.append(
            {
                "time": int(bar.timestamp.timestamp()),
                "open": bar.open,
                "high": bar.high,
                "low": bar.low,
                "close": bar.close,
                "volume": bar.volume,
            }
        )
    out.reverse()
    return out


def get_bars_batch(
    symbols: list[str], timeframe: str, limit: int
) -> dict[str, list[dict]]:
    """One round-trip for last-N bars across N symbols, keyed by symbol.

    Powers the watchlist sparkline cards (was N parallel ``/api/bars`` calls).
    Alpaca's multi-symbol bar request scopes ``limit`` to the *total* response,
    not per-symbol, so we open a wide ``start`` window instead and trim
    per-symbol to the last ``limit`` bars."""
    if not symbols:
        return {}
    tf = timeframe_from_str(timeframe)
    # Wide enough for daily-bar sparklines through weekends/holidays. For
    # intraday timeframes this slightly over-pulls; trimming below caps it.
    start = datetime.now(timezone.utc) - timedelta(days=max(limit * 2, 30))
    out: dict[str, list[dict]] = {}

    crypto = [s.upper() for s in symbols if is_crypto(s)]
    stocks = [s.upper() for s in symbols if not is_crypto(s)]

    def _emit(sym: str, bars_for_sym) -> None:
        rows = [
            {
                "time": int(b.timestamp.timestamp()),
                "open": b.open,
                "high": b.high,
                "low": b.low,
                "close": b.close,
                "volume": b.volume,
            }
            for b in bars_for_sym
        ]
        out[sym] = rows[-limit:]

    if stocks:
        req = StockBarsRequest(
            symbol_or_symbols=stocks, timeframe=tf, start=start, feed=_feed()
        )
        data = data_client().get_stock_bars(req).data
        for sym in stocks:
            _emit(sym, data.get(sym, []))
    if crypto:
        req = CryptoBarsRequest(symbol_or_symbols=crypto, timeframe=tf, start=start)
        data = crypto_data_client().get_crypto_bars(req).data
        for sym in crypto:
            _emit(sym, data.get(sym, []))
    return out


def get_daily_closes(symbols: list[str], start: datetime) -> dict[str, dict[str, float]]:
    """Daily close prices per symbol from `start` to now, keyed by ISO date.

    Equities and crypto hit different Alpaca endpoints, so they are batched
    into one multi-symbol request each. Used to value historical open lots
    when rebuilding the per-silo P/L curve.
    """
    out: dict[str, dict[str, float]] = {}
    if not symbols:
        return out
    tf = timeframe_from_str("1Day")
    equities = [s.upper() for s in symbols if not is_crypto(s)]
    cryptos = [s.upper() for s in symbols if is_crypto(s)]

    if equities:
        req = StockBarsRequest(
            symbol_or_symbols=equities, timeframe=tf, start=start, feed=_feed()
        )
        data = data_client().get_stock_bars(req).data
        for sym in equities:
            out[sym] = {
                bar.timestamp.date().isoformat(): float(bar.close)
                for bar in data.get(sym, [])
            }
    if cryptos:
        req = CryptoBarsRequest(symbol_or_symbols=cryptos, timeframe=tf, start=start)
        data = crypto_data_client().get_crypto_bars(req).data
        for sym in cryptos:
            out[sym] = {
                bar.timestamp.date().isoformat(): float(bar.close)
                for bar in data.get(sym, [])
            }
    return out


def normalize_quote(symbol: str, q) -> dict:
    """Shared quote shape for both the poll path (here) and the SSE
    stream (``stream.py``). Single-sourced so the load-bearing
    stream/poll fallback can never drift on the mid formula."""
    bid = float(q.bid_price or 0)
    ask = float(q.ask_price or 0)
    mid = round((bid + ask) / 2, 4) if bid and ask else (ask or bid)
    return {
        "symbol": symbol,
        "bid": bid,
        "ask": ask,
        "mid": mid,
        "time": int(q.timestamp.timestamp()),
    }


def get_latest_quotes(symbols: list[str]) -> list[dict]:
    if not symbols:
        return []
    crypto = [s for s in symbols if is_crypto(s)]
    stocks = [s for s in symbols if not is_crypto(s)]
    out: list[dict] = []
    if stocks:
        req = StockLatestQuoteRequest(symbol_or_symbols=stocks, feed=_feed())
        quotes = data_client().get_stock_latest_quote(req)
        out.extend(normalize_quote(sym, q) for sym, q in quotes.items())
    if crypto:
        req = CryptoLatestQuoteRequest(symbol_or_symbols=crypto)
        quotes = crypto_data_client().get_crypto_latest_quote(req)
        out.extend(normalize_quote(sym, q) for sym, q in quotes.items())
    return out


def _snap_dict(sym: str, s) -> dict:
    daily = s.daily_bar
    prev = s.previous_daily_bar
    last_trade = s.latest_trade
    last_quote = s.latest_quote
    bid = float(last_quote.bid_price or 0) if last_quote else 0.0
    ask = float(last_quote.ask_price or 0) if last_quote else 0.0
    mid = (bid + ask) / 2 if bid and ask else (ask or bid)
    return {
        "symbol": sym,
        "prev_close": prev.close if prev else None,
        "day_open": daily.open if daily else None,
        "day_high": daily.high if daily else None,
        "day_low": daily.low if daily else None,
        "day_close": daily.close if daily else None,
        "day_volume": daily.volume if daily else None,
        "last_price": last_trade.price if last_trade else (mid or None),
        "last_time": int(last_trade.timestamp.timestamp()) if last_trade else None,
    }


def get_snapshots(symbols: list[str]) -> list[dict]:
    """One round-trip for prev-close / day OHLC / last price across N symbols.

    Replaces the watchlist's N parallel ``useBars(sym, "1Day")`` mount burst
    (BACKLOG: "Watchlist day-delta data path"). Alpaca's snapshot returns
    the latest trade + latest quote + minute bar + daily bar + previous
    daily bar atomically, so day-percent change can be computed without a
    second call."""
    if not symbols:
        return []
    crypto = [s for s in symbols if is_crypto(s)]
    stocks = [s for s in symbols if not is_crypto(s)]
    out: list[dict] = []
    if stocks:
        req = StockSnapshotRequest(symbol_or_symbols=stocks, feed=_feed())
        snaps = data_client().get_stock_snapshot(req)
        out.extend(_snap_dict(sym, s) for sym, s in snaps.items())
    if crypto:
        req = CryptoSnapshotRequest(symbol_or_symbols=crypto)
        snaps = crypto_data_client().get_crypto_snapshot(req)
        out.extend(_snap_dict(sym, s) for sym, s in snaps.items())
    return out
