"""CSV report builders for the Ask anything `generate_report` tool.

Pure stdlib (`csv`) so there's no new dependency and nothing to ship through
the dual requirements / Vercel-Python path. Each builder returns
``(filename, csv_text, row_count)``; the bot offers the CSV as a download.
"""

import csv
import io
from datetime import date

from .. import alpaca
from ..alpaca.pnl import get_pnl_history


def _is_crypto(symbol: str, asset_class: str | None = None) -> bool:
    return asset_class == "crypto" or "/" in symbol


def _in_scope(symbol: str, asset_class: str | None, scope: str) -> bool:
    if scope == "all":
        return True
    crypto = _is_crypto(symbol, asset_class)
    return crypto if scope == "crypto" else not crypto


def _to_csv(header: list[str], rows: list[list]) -> str:
    buf = io.StringIO()
    w = csv.writer(buf)
    w.writerow(header)
    w.writerows(rows)
    return buf.getvalue()


def rows_to_csv(rows: list, columns: list[str] | None = None) -> str:
    """Serialize arbitrary model-supplied rows (list of objects) to CSV. Used
    by the general export_csv tool. Column order is the given `columns`, else
    the union of keys in first-seen order."""
    dicts = [r for r in rows if isinstance(r, dict)]
    if columns is None:
        columns = []
        for r in dicts:
            for k in r.keys():
                if k not in columns:
                    columns.append(str(k))
    buf = io.StringIO()
    w = csv.DictWriter(buf, fieldnames=columns, extrasaction="ignore")
    w.writeheader()
    for r in dicts:
        w.writerow({c: r.get(c, "") for c in columns})
    return buf.getvalue()


def _suffix(scope: str) -> str:
    return "account" if scope == "all" else scope


def build_report(kind: str, scope: str) -> tuple[str, str, int]:
    """Return (filename, csv_text, row_count) for the requested report."""
    scope = scope if scope in ("stocks", "crypto", "all") else "all"
    today = date.today().isoformat()

    if kind == "positions":
        header = [
            "symbol", "asset_class", "qty", "avg_entry_price", "current_price",
            "market_value", "cost_basis", "unrealized_pl", "unrealized_plpc",
        ]
        rows = [
            [
                p["symbol"], p.get("asset_class", ""), p["qty"],
                p["avg_entry_price"], p["current_price"], p["market_value"],
                p["cost_basis"], p["unrealized_pl"], p["unrealized_plpc"],
            ]
            for p in alpaca.get_positions()
            if _in_scope(p["symbol"], p.get("asset_class"), scope)
        ]
        return f"positions-{_suffix(scope)}-{today}.csv", _to_csv(header, rows), len(rows)

    if kind == "orders":
        header = [
            "id", "symbol", "asset_class", "side", "type", "qty", "filled_qty",
            "filled_avg_price", "limit_price", "stop_price", "status", "submitted_at",
        ]
        rows = [
            [
                o["id"], o["symbol"], o.get("asset_class") or "", o["side"],
                o["type"], o.get("qty"), o.get("filled_qty"),
                o.get("filled_avg_price"), o.get("limit_price"),
                o.get("stop_price"), o["status"], o.get("submitted_at"),
            ]
            for o in alpaca.get_orders("all", 100)
            if _in_scope(o["symbol"], o.get("asset_class"), scope)
        ]
        return f"orders-{_suffix(scope)}-{today}.csv", _to_csv(header, rows), len(rows)

    if kind == "activities":
        header = [
            "activity_type", "transaction_time", "symbol", "side", "qty",
            "price", "net_amount",
        ]
        rows = []
        for a in alpaca.get_activities(None, 100):
            sym = str(a.get("symbol", ""))
            if sym and not _in_scope(sym, None, scope):
                continue
            rows.append([
                a.get("activity_type", ""), a.get("transaction_time", a.get("date", "")),
                sym, a.get("side", ""), a.get("qty", ""), a.get("price", ""),
                a.get("net_amount", ""),
            ])
        return f"activities-{_suffix(scope)}-{today}.csv", _to_csv(header, rows), len(rows)

    if kind == "pnl":
        header = ["silo", "holdings", "unrealized_pl", "realized_pl", "net_pl"]
        silos = ["stocks", "crypto"] if scope == "all" else [scope]
        positions = alpaca.get_positions()
        rows = []
        for silo in silos:
            held = [
                p for p in positions
                if _in_scope(p["symbol"], p.get("asset_class"), silo)
            ]
            holdings = sum(p["market_value"] for p in held)
            unrealized = sum(p["unrealized_pl"] for p in held)
            curve = get_pnl_history(silo, "ALL").get("pnl") or []
            # curve tip = live market value + cumulative realized → realised P/L.
            realized = round((curve[-1] - holdings), 2) if curve else 0.0
            net = round(realized + unrealized, 2)
            rows.append([silo, round(holdings, 2), round(unrealized, 2), realized, net])
        return f"pnl-{_suffix(scope)}-{today}.csv", _to_csv(header, rows), len(rows)

    raise ValueError(f"unknown report kind: {kind}")
