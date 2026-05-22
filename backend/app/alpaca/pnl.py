"""Per-silo running net P/L curve, reconstructed from fills + daily closes.

Alpaca exposes no per-asset-class portfolio history, so the curve is rebuilt
from scratch: pull every FILL activity, FIFO-match sells against buys to track
open lots and realized P/L, then value the still-open lots against historical
daily closes. The curve value on day ``d`` is

    open_market_value(d) + cumulative_realized(d)

i.e. the notional entry cost of open positions plus what trading has earned,
deposits ignored. Daily granularity; FIFO assumed; fees are folded into the
fill price.
"""

from collections import defaultdict, deque
from datetime import date, datetime, time, timedelta, timezone

from .account import get_positions
from .client import coerce_silo, is_crypto, normalize_crypto_symbol, trading_client
from .market_data import get_daily_closes

# Lookback per period; ``ALL`` (or anything unmapped) walks back to the first
# fill.
_PERIOD_DAYS: dict[str, int] = {"1M": 31, "3M": 93, "1Y": 366}


def _parse_ts(value) -> datetime:
    return datetime.fromisoformat(str(value).replace("Z", "+00:00"))


def _fetch_fills() -> list[dict]:
    """Every FILL activity, paginated via ``page_token`` (newest-first pages)."""
    out: list[dict] = []
    page_token: str | None = None
    while True:
        params: dict = {"activity_types": "FILL", "page_size": 100}
        if page_token:
            params["page_token"] = page_token
        page = trading_client().get("/account/activities", data=params)
        if not isinstance(page, list) or not page:
            break
        out.extend(page)
        if len(page) < 100:
            break
        page_token = page[-1].get("id")
        if not page_token:
            break
    return out


def _start_dt(d: date) -> datetime:
    return datetime.combine(d, time.min, tzinfo=timezone.utc)


def get_pnl_history(asset_class: str, period: str = "ALL") -> dict:
    silo = coerce_silo(asset_class)
    want_crypto = silo == "crypto"

    parsed: list[tuple[datetime, str, str, float, float]] = []
    for f in _fetch_fills():
        sym = normalize_crypto_symbol(str(f.get("symbol", "")))
        if not sym or is_crypto(sym) != want_crypto:
            continue
        try:
            dt = _parse_ts(f["transaction_time"])
            qty = float(f["qty"])
            price = float(f["price"])
        except (KeyError, TypeError, ValueError):
            continue
        parsed.append((dt, sym, str(f.get("side", "")).lower(), qty, price))

    if not parsed:
        return {"t": [], "pnl": [], "asset_class": silo}

    # Sort by full timestamp so a same-day buy-then-sell is FIFO-applied in
    # the right order.
    parsed.sort(key=lambda r: r[0])
    first_day = parsed[0][0].date()
    today = datetime.now(timezone.utc).date()
    days = _PERIOD_DAYS.get(period)
    window_start = max(first_day, today - timedelta(days=days)) if days else first_day
    if window_start > today:
        window_start = first_day

    symbols = sorted({r[1] for r in parsed})
    closes = get_daily_closes(symbols, _start_dt(window_start))

    # Live open market value for today's tip, so the curve ends on the same
    # number the position-derived cards show (daily closes lag intraday).
    live_market_value = sum(
        float(p.get("market_value") or 0)
        for p in get_positions()
        if is_crypto(normalize_crypto_symbol(str(p.get("symbol", "")))) == want_crypto
    )

    lots: dict[str, deque[list[float]]] = defaultdict(deque)
    realized = 0.0

    def apply_fill(sym: str, side: str, qty: float, price: float) -> None:
        nonlocal realized
        dq = lots[sym]
        if side == "buy":
            dq.append([qty, price])
            return
        remaining = qty
        while remaining > 1e-12 and dq:
            lot = dq[0]
            take = min(lot[0], remaining)
            realized += (price - lot[1]) * take
            lot[0] -= take
            remaining -= take
            if lot[0] <= 1e-12:
                dq.popleft()
        # Oversell (e.g. a position fully closed by Alpaca) leaves no lot to
        # match; the residual is dropped — paper crypto cannot go short.

    fi = 0
    n = len(parsed)
    # Pre-roll fills before the window so lots/realized reflect prior trading.
    while fi < n and parsed[fi][0].date() < window_start:
        _, sym, side, qty, price = parsed[fi]
        apply_fill(sym, side, qty, price)
        fi += 1

    last_close: dict[str, float] = {}
    t_out: list[int] = []
    pnl_out: list[float] = []
    opening_value: float | None = None
    cur = window_start
    while cur <= today:
        while fi < n and parsed[fi][0].date() <= cur:
            _, sym, side, qty, price = parsed[fi]
            apply_fill(sym, side, qty, price)
            fi += 1

        # Cost-valued baseline of the first populated day. Prepended below so
        # that an account that only traded today still draws an entry→now line
        # (a single daily point can't, and the daily axis lags intraday).
        if opening_value is None:
            opening_value = (
                sum(lot[0] * lot[1] for dq in lots.values() for lot in dq) + realized
            )

        iso = cur.isoformat()
        if cur == today:
            market_value = live_market_value
        else:
            market_value = 0.0
            for sym, dq in lots.items():
                qty_open = sum(lot[0] for lot in dq)
                if qty_open <= 1e-12:
                    continue
                close = closes.get(sym, {}).get(iso)
                if close is not None:
                    last_close[sym] = close
                px = last_close.get(sym)
                if px is None:
                    # No close yet (weekend/holiday before any bar): fall back
                    # to average lot cost so the point isn't distorted.
                    px = sum(lot[0] * lot[1] for lot in dq) / qty_open
                market_value += qty_open * px

        t_out.append(int(_start_dt(cur).timestamp()))
        pnl_out.append(round(market_value + realized, 2))
        cur += timedelta(days=1)

    # Prepend the entry-cost anchor so the curve starts at notional invested
    # and always has ≥2 points once there is any trade history.
    if opening_value is not None:
        t_out.insert(0, int(_start_dt(window_start).timestamp()))
        pnl_out.insert(0, round(opening_value, 2))

    return {"t": t_out, "pnl": pnl_out, "asset_class": silo}
