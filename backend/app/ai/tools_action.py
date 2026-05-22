"""Ask-anything action tool schemas: watchlist mutation and report/CSV export.

Available ONLY to the ⌘K Ask anything bot (not ChartBot, which uses ``TOOLS``
and would mis-route any non-read tool to the frontend). Resolved server-side in
``router._execute_read_tool``. Split out of ``tools.py``; ``ask_tools()`` there
appends these to the read tools. Schema text is load-bearing for Anthropic
prefix-cache hits — don't edit.
"""

from typing import Any

_ASSET_CLASS_PROP = {
    "type": "string",
    "enum": ["stocks", "crypto"],
    "description": (
        "Which silo to target. Omit to use the user's active silo; set "
        "explicitly only for an other-silo request."
    ),
}

ASK_ACTION_TOOLS: list[dict[str, Any]] = [
    {
        "name": "add_to_watchlist",
        "description": (
            "Add one or more symbols to the user's watchlist (bulk). Validate "
            "each is tradable first (find_symbol/get_asset). For themed/sector "
            "requests like 'top 10 pharma stocks', name candidate tickers from "
            "your own knowledge, then validate before adding; use web_search "
            "only when the user asks for a current/ranked list. Report what was "
            "added vs skipped."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbols": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tickers (stocks) or pairs like BTC/USD (crypto).",
                },
                "asset_class": _ASSET_CLASS_PROP,
            },
            "required": ["symbols"],
        },
    },
    {
        "name": "remove_from_watchlist",
        "description": (
            "Remove one or more symbols from the user's watchlist (bulk). "
            "Report what was removed vs not found."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbols": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Tickers (stocks) or pairs like BTC/USD (crypto).",
                },
                "asset_class": _ASSET_CLASS_PROP,
            },
            "required": ["symbols"],
        },
    },
    {
        "name": "generate_report",
        "description": (
            "Build a downloadable CSV report and offer it to the user. Tell "
            "them the report is ready to download; do not paste the full CSV."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "kind": {
                    "type": "string",
                    "enum": ["positions", "orders", "activities", "pnl"],
                    "description": "Which report to build.",
                },
                "asset_class": {
                    "type": "string",
                    "enum": ["stocks", "crypto", "all"],
                    "description": (
                        "Scope. Omit to use the active silo; 'all' for the "
                        "whole account."
                    ),
                },
            },
            "required": ["kind"],
        },
    },
    {
        "name": "export_csv",
        "description": (
            "Export ANY tabular data you can read or compute into a downloadable "
            "CSV — price history (call get_bars first), quotes, snapshots, news, "
            "watchlist, movers, or a custom table you assembled. Fetch the data "
            "with the read tools, then pass the COMPLETE rows here (do not "
            "summarise or truncate). For the standard account reports "
            "(positions/orders/activities/pnl) prefer generate_report instead. "
            "Tell the user it's ready to download; don't paste the rows."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "filename": {
                    "type": "string",
                    "description": "Download name, e.g. 'AAPL-daily-bars.csv'.",
                },
                "columns": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": (
                        "Optional column order. Omit to infer from the row keys."
                    ),
                },
                "rows": {
                    "type": "array",
                    "items": {"type": "object"},
                    "description": "The full dataset, one object per row.",
                },
            },
            "required": ["filename", "rows"],
        },
    },
]

ASK_ACTION_TOOL_NAMES = {t["name"] for t in ASK_ACTION_TOOLS}
