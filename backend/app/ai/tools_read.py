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
    "get_asset_profile",
    "screen_assets",
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
    {
        "name": "get_asset_profile",
        "description": (
            "Full catalogue profile for ONE known symbol. Stocks: sector, "
            "industry, country, CEO, employees, IPO date, market cap, beta, "
            "description, AND annual fundamentals — P/E, P/S, P/B, EV/EBITDA, "
            "PEG, gross/operating/net margin, ROE, ROIC, debt/equity, current "
            "ratio, diluted EPS, free cash flow, revenue & EPS YoY growth, "
            "dividend yield/payout, and a 5-year revenue/net-income/EPS/FCF "
            "trend (financials_annual). Crypto: category tags, market-cap rank, "
            "circulating/total/max supply, all-time high/low, description. Use "
            "when the user names a specific ticker and asks about its "
            "fundamentals, financials, valuation, profitability, classification, "
            "or background (e.g. 'what's NVDA's net margin', 'is AAPL's revenue "
            "growing', 'when did Coinbase IPO', 'what is BTC's max supply'). To "
            "resolve a vague description to a ticker, use find_symbol instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Exact ticker, e.g. AAPL or BTC/USD.",
                },
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "screen_assets",
        "description": (
            "Screen the asset catalogue by structured criteria and return the "
            "top matches ranked by market cap. Use when the user describes a "
            "SET of assets by attributes rather than naming one (e.g. 'large-cap "
            "healthcare stocks', 'biotech under $2B', 'high-beta tech names', "
            "'cheap profitable value stocks', 'high-dividend names', "
            "'fast-growing software', 'DeFi coins', 'meme coins'). Stock screens "
            "support annual-fundamentals filters/sorts (P/E, dividend yield, net "
            "margin, ROE, revenue growth). For a single named ticker use "
            "get_asset_profile; to resolve a vague NAME to a ticker use "
            "find_symbol. Screens only the curated, enriched universe (large & "
            "options-listed US stocks + major crypto), not every listed "
            "security. Stock screens EXCLUDE ETFs/funds unless asset_type is "
            "set. Returns total_matches + a capped result list (has_more flags "
            "overflow)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "asset_class": {
                    "type": "string",
                    "enum": ["stocks", "crypto"],
                    "description": "Which silo to screen. Omit to use the active silo.",
                },
                "sector": {
                    "type": "string",
                    "enum": [
                        "Basic Materials", "Communication Services",
                        "Consumer Cyclical", "Consumer Defensive", "Energy",
                        "Financial Services", "Healthcare", "Industrials",
                        "Real Estate", "Technology", "Utilities",
                    ],
                    "description": "Stocks only. GICS sector.",
                },
                "industry": {
                    "type": "string",
                    "description": (
                        "Stocks only. Partial industry match, e.g. "
                        "'Biotechnology', 'Banks', 'Semiconductors'. Uses FMP's "
                        "labels; on a no-match the result lists real "
                        "industry_suggestions to retry with."
                    ),
                },
                "asset_type": {
                    "type": "string",
                    "enum": ["stock", "etf", "adr", "any"],
                    "description": (
                        "Stocks only. 'stock' (default) = operating companies "
                        "+ ADRs, no ETFs/funds; 'etf' / 'adr' to target those; "
                        "'any' for no type filter."
                    ),
                },
                "category": {
                    "type": "string",
                    "enum": [
                        "defi", "layer1", "dex", "meme", "stablecoin", "ai",
                        "rwa", "depin", "governance", "yield", "exchange_token",
                        "pos", "pow", "btc_fork", "infrastructure",
                    ],
                    "description": "Crypto only. Theme/category filter.",
                },
                "market_cap_min": {
                    "type": "number",
                    "description": "Minimum market cap in USD, e.g. 1e10 for $10B.",
                },
                "market_cap_max": {
                    "type": "number",
                    "description": "Maximum market cap in USD.",
                },
                "beta_min": {"type": "number", "description": "Stocks only. Minimum beta."},
                "beta_max": {"type": "number", "description": "Stocks only. Maximum beta."},
                "exchange": {
                    "type": "string",
                    "enum": ["NASDAQ", "NYSE", "ARCA", "BATS", "AMEX", "OTC"],
                    "description": "Stocks only. Listing exchange.",
                },
                "ipo_after": {
                    "type": "string",
                    "description": "Stocks only. IPO on/after this date (YYYY-MM-DD).",
                },
                "ipo_before": {
                    "type": "string",
                    "description": "Stocks only. IPO on/before this date (YYYY-MM-DD).",
                },
                "pe_min": {"type": "number", "description": "Stocks only. Minimum P/E ratio."},
                "pe_max": {
                    "type": "number",
                    "description": "Stocks only. Maximum P/E ratio (e.g. 15 for 'cheap' value names).",
                },
                "dividend_yield_min": {
                    "type": "number",
                    "description": (
                        "Stocks only. Minimum dividend yield as a FRACTION "
                        "(0.03 = 3%). Use for 'dividend' / 'income' / 'high-yield' "
                        "requests."
                    ),
                },
                "net_margin_min": {
                    "type": "number",
                    "description": (
                        "Stocks only. Minimum net profit margin as a FRACTION "
                        "(0.2 = 20%). Use for 'profitable' / 'high-margin'."
                    ),
                },
                "roe_min": {
                    "type": "number",
                    "description": "Stocks only. Minimum return on equity as a FRACTION (0.15 = 15%).",
                },
                "revenue_growth_min": {
                    "type": "number",
                    "description": (
                        "Stocks only. Minimum YoY revenue growth as a FRACTION "
                        "(0.2 = 20%). Use for 'fast-growing' / 'growth' names."
                    ),
                },
                "sort_by": {
                    "type": "string",
                    "enum": [
                        "market_cap_desc", "market_cap_asc", "beta_desc",
                        "beta_asc", "ipo_newest", "ipo_oldest",
                        "pe_asc", "pe_desc", "dividend_yield_desc",
                        "net_margin_desc", "roe_desc", "revenue_growth_desc",
                    ],
                    "description": (
                        "Result ordering (default 'market_cap_desc' = biggest "
                        "first). Use 'market_cap_asc' for smallest/cheapest "
                        "first. beta_*, ipo_*, pe_*, dividend_yield_desc, "
                        "net_margin_desc, roe_desc and revenue_growth_desc are "
                        "stocks-only; crypto supports only the market_cap sorts."
                    ),
                },
                "limit": {
                    "type": "integer",
                    "minimum": 1,
                    "maximum": 50,
                    "description": "Max rows to return (default 20).",
                },
            },
        },
    },
]
