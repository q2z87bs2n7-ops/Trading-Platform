"""Read tool schemas — the backend executes these via ``alpaca/`` helpers.

Split out of ``tools.py``; the assembler there concatenates these (first) with
the frontend-executed schemas to build the unified ``TOOLS`` list. Schema text
and ordering are load-bearing for Anthropic prefix-cache hits — don't edit.
"""

from typing import Any

# Read tools — backend executes via alpaca/ helpers
READ_TOOL_NAMES = {
    "get_bars",
    "get_positions",
    "get_position",
    "get_orders",
    "get_account",
    "get_quote",
    "get_snapshot",
    "get_news",
    "get_movers",
    "find_symbol",
    "get_activities",
    "get_clock",
    "get_calendar",
    "get_watchlist",
    "get_corporate_actions",
}


READ_TOOLS: list[dict[str, Any]] = [
    {
        "name": "get_bars",
        "description": (
            "Fetch historical OHLCV bars for a symbol. Use when you need to "
            "reason about price action (e.g. find a swing high, compute a "
            "moving average level, locate support/resistance)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Ticker, e.g. AAPL."},
                "timeframe": {
                    "type": "string",
                    "enum": ["1Min", "5Min", "15Min", "1Hour", "1Day"],
                    "description": "Bar interval.",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 500,
                    "description": "Number of most-recent bars to return (max 500).",
                },
            },
            "required": ["symbol", "timeframe", "limit"],
        },
    },
    {
        "name": "get_positions",
        "description": "List all open positions on the paper account.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_position",
        "description": "Get the open position for a single symbol, or null if none.",
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string"}},
            "required": ["symbol"],
        },
    },
    {
        "name": "get_orders",
        "description": "List orders (open by default). Use to find recent activity.",
        "input_schema": {
            "type": "object",
            "properties": {
                "status": {
                    "type": "string",
                    "enum": ["open", "closed", "all"],
                    "description": "Order status filter (default open).",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "description": "Max orders to return (default 25).",
                },
            },
        },
    },
    {
        "name": "get_account",
        "description": "Summary of the paper account: equity, buying power, cash.",
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_quote",
        "description": "Latest bid/ask/last for a single symbol.",
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string"}},
            "required": ["symbol"],
        },
    },
    {
        "name": "get_snapshot",
        "description": (
            "Symbol snapshot: previous close + day OHLC + latest trade. "
            "Cheaper than get_bars when you just need today's price context."
        ),
        "input_schema": {
            "type": "object",
            "properties": {"symbol": {"type": "string"}},
            "required": ["symbol"],
        },
    },
    {
        "name": "get_news",
        "description": (
            "Fetch recent news headlines. Pass `symbol` for per-ticker news "
            "(via Alpaca/Benzinga); omit it for the market-wide top-stories "
            "feed (via Yahoo Finance RSS, 5-minute cached)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Optional ticker. Omit for market-wide news.",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 50,
                    "description": "Max headlines to return (default 10).",
                },
            },
        },
    },
    {
        "name": "get_movers",
        "description": (
            "Top market gainers and losers by percent change for the current "
            "session. Useful for 'what's moving today' questions."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "top": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 25,
                    "description": "How many of each (gainers, losers) to return (default 10).",
                },
            },
        },
    },
    {
        "name": "find_symbol",
        "description": (
            "Search for tradable assets by ticker or company-name fragment. "
            "Use when the user describes an instrument without giving an "
            "exact ticker (e.g. 'oil ETFs', 'taiwan semi')."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "query": {
                    "type": "string",
                    "description": "Ticker fragment or company-name keyword.",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 25,
                    "description": "Max matches (default 10).",
                },
                "asset_class": {
                    "type": "string",
                    "enum": ["stocks", "crypto"],
                    "description": (
                        "Which silo to search. Omit to use the user's active "
                        "silo; set explicitly only when they ask about the "
                        "other asset class."
                    ),
                },
            },
            "required": ["query"],
        },
    },
    {
        "name": "get_activities",
        "description": (
            "Fetch account activity history: trade fills (FILL), dividends "
            "(DIV), interest (INT), and fees (FEE). Use for 'what did I trade "
            "last week', 'my average entry on AAPL', 'realized P&L today', "
            "'recent fills'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "activity_type": {
                    "type": "string",
                    "enum": ["FILL", "DIV", "INT", "FEE"],
                    "description": "Filter by type. Omit to return all types.",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 100,
                    "description": "Max activities to return (default 25).",
                },
            },
        },
    },
    {
        "name": "get_clock",
        "description": (
            "Current market clock: whether the market is open right now, and "
            "the next open/close times as UNIX timestamps. Use for 'is market "
            "open', 'when does market close', 'premarket hours' questions."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_calendar",
        "description": (
            "Trading calendar: market open and close times for each session. "
            "Pass a date range for a specific window; omit both for the "
            "current month. Use for 'next trading day', 'was market open on "
            "X date', or 'what did the stock do last session' on weekends."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "start": {
                    "type": "string",
                    "description": "Start date (YYYY-MM-DD). Optional.",
                },
                "end": {
                    "type": "string",
                    "description": "End date (YYYY-MM-DD). Optional.",
                },
            },
        },
    },
    {
        "name": "get_watchlist",
        "description": (
            "Fetch the user's watchlist symbols. Use when they ask about "
            "'my watchlist' or 'how are my watched stocks doing'; then call "
            "get_snapshot on the returned symbols for current prices."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_class": {
                    "type": "string",
                    "enum": ["stocks", "crypto"],
                    "description": (
                        "Which watchlist to fetch. Omit to use the user's "
                        "active silo; set explicitly only when they ask about "
                        "the other asset class."
                    ),
                },
            },
        },
    },
    {
        "name": "get_corporate_actions",
        "description": (
            "Fetch corporate action announcements: splits, dividends, mergers, "
            "and spinoffs. Use for 'why did X gap down/up', 'any dividends "
            "coming for AAPL', 'was there a split'. Pass symbols to filter "
            "by ticker; omit for market-wide announcements."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbols": {
                    "type": "array",
                    "items": {"type": "string"},
                    "description": "Optional ticker list to filter by.",
                },
                "types": {
                    "type": "array",
                    "items": {
                        "type": "string",
                        "enum": ["dividend", "merger", "spinoff", "split"],
                    },
                    "description": "Optional action types to filter by.",
                },
                "since": {
                    "type": "string",
                    "description": "Filter from this date (YYYY-MM-DD). Optional.",
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 50,
                    "description": "Max announcements to return (default 20).",
                },
            },
        },
    },
]
