"""JSON-schema tool declarations exposed to Claude.

Two halves: read tools run on the backend (wrap existing alpaca helpers);
drawing tools run on the frontend against IChartWidgetApi. The model sees
one unified tool list and doesn't care which side executes — the
dispatcher in ``router`` does that split.
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

# Frontend-executed tools (backend declares, frontend dispatches on the
# TradingView widget). Drawing primitives, chart navigation, trading
# visualization, inspection, and capture all live here because the
# dispatcher only distinguishes read vs not-read.
DRAW_TOOL_NAMES = {
    # Drawing primitives
    "draw_horizontal_line",
    "draw_vertical_line",
    "draw_trend_line",
    "draw_rectangle",
    "draw_fib_retracement",
    "draw_text",
    "draw_arrow",
    "add_indicator",
    "list_drawings",
    "remove_drawing",
    "modify_drawing",
    # Chart navigation
    "set_symbol",
    "set_resolution",
    "set_chart_type",
    "set_visible_range",
    "set_timezone",
    # Trading visualization
    "propose_order",
    "show_position_line",
    "mark_bar",
    "mark_execution",
    # Comparison overlay
    "compare_symbol",
    # Chart inspection
    "get_chart_state",
    "inspect_chart",
    "get_drawing_properties",
    "set_drawing_properties",
    # Capture / export
    "take_screenshot",
    "export_chart_data",
}


_SYMBOL_FIELD = {
    "type": "string",
    "description": (
        "Optional ticker the drawing belongs to. Defaults to the chart's "
        "current symbol. If a different symbol is given, the drawing is "
        "queued and rendered when that symbol is loaded on the chart."
    ),
}


_POINT_SCHEMA = {
    "type": "object",
    "properties": {
        "time": {
            "type": "integer",
            "description": "UNIX timestamp in seconds (TradingView's chart time axis).",
        },
        "price": {"type": "number", "description": "Y-axis price coordinate."},
    },
    "required": ["time", "price"],
    "additionalProperties": False,
}


TOOLS: list[dict[str, Any]] = [
    # --- READ TOOLS (backend) -------------------------------------------------
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
    # --- DRAWING TOOLS (frontend executes) ------------------------------------
    {
        "name": "draw_horizontal_line",
        "description": (
            "Draw a horizontal price line on the current chart. Use for "
            "support/resistance levels, moving averages, target prices, "
            "entry/stop/take-profit lines."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "price": {"type": "number"},
                "text": {"type": "string", "description": "Optional label."},
                "color": {
                    "type": "string",
                    "description": "Optional hex color, e.g. #3b82f6.",
                },
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["price"],
        },
    },
    {
        "name": "draw_vertical_line",
        "description": "Draw a vertical line at a specific time (event marker).",
        "input_schema": {
            "type": "object",
            "properties": {
                "time": {"type": "integer", "description": "UNIX timestamp (seconds)."},
                "text": {"type": "string"},
                "color": {"type": "string"},
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["time"],
        },
    },
    {
        "name": "draw_trend_line",
        "description": "Draw a trend line between two price/time points.",
        "input_schema": {
            "type": "object",
            "properties": {
                "point1": _POINT_SCHEMA,
                "point2": _POINT_SCHEMA,
                "text": {"type": "string"},
                "color": {"type": "string"},
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["point1", "point2"],
        },
    },
    {
        "name": "draw_rectangle",
        "description": "Draw a rectangle highlighting a region between two points.",
        "input_schema": {
            "type": "object",
            "properties": {
                "point1": _POINT_SCHEMA,
                "point2": _POINT_SCHEMA,
                "color": {"type": "string"},
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["point1", "point2"],
        },
    },
    {
        "name": "draw_fib_retracement",
        "description": "Draw a Fibonacci retracement between two pivot points.",
        "input_schema": {
            "type": "object",
            "properties": {
                "point1": _POINT_SCHEMA,
                "point2": _POINT_SCHEMA,
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["point1", "point2"],
        },
    },
    {
        "name": "draw_text",
        "description": "Place a text annotation on the chart.",
        "input_schema": {
            "type": "object",
            "properties": {
                "point": _POINT_SCHEMA,
                "text": {"type": "string"},
                "color": {"type": "string"},
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["point", "text"],
        },
    },
    {
        "name": "draw_arrow",
        "description": "Place an up or down arrow at a point (e.g. mark a swing).",
        "input_schema": {
            "type": "object",
            "properties": {
                "point": _POINT_SCHEMA,
                "direction": {"type": "string", "enum": ["up", "down"]},
                "text": {"type": "string"},
                "color": {"type": "string"},
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["point", "direction"],
        },
    },
    {
        "name": "add_indicator",
        "description": (
            "Add a built-in TradingView indicator/study to the chart by name "
            "(e.g. 'Moving Average', 'Relative Strength Index', 'Bollinger Bands'). "
            "Pass indicator-specific inputs as a flat object if needed."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "name": {
                    "type": "string",
                    "description": "Indicator name as TV expects (case-sensitive).",
                },
                "inputs": {
                    "type": "object",
                    "description": "Indicator-specific input overrides (optional).",
                },
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["name"],
        },
    },
    {
        "name": "list_drawings",
        "description": (
            "List drawings you've previously added on this chart (for the "
            "current symbol+resolution). Use before remove_drawing or "
            "modify_drawing."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "remove_drawing",
        "description": "Remove a previously-added drawing by its id.",
        "input_schema": {
            "type": "object",
            "properties": {
                "drawing_id": {"type": "string", "description": "id from list_drawings."},
            },
            "required": ["drawing_id"],
        },
    },
    {
        "name": "modify_drawing",
        "description": (
            "Move or restyle an existing drawing in place. Look the id up "
            "with list_drawings first. Provide only the fields you want to "
            "change: price for a horizontal line, time for a vertical line, "
            "point for single-point shapes (text/arrow), point1+point2 for "
            "two-point shapes (trend_line/rectangle/fib_retracement). "
            "text and color can be updated on any shape that supports them. "
            "Indicators (studies) can't be modified — remove and re-add "
            "instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "drawing_id": {"type": "string"},
                "price": {"type": "number"},
                "time": {"type": "integer"},
                "point": _POINT_SCHEMA,
                "point1": _POINT_SCHEMA,
                "point2": _POINT_SCHEMA,
                "text": {"type": "string"},
                "color": {"type": "string"},
            },
            "required": ["drawing_id"],
        },
    },
    # --- CHART NAVIGATION (frontend executes) ---------------------------------
    {
        "name": "set_symbol",
        "description": (
            "Switch the active chart to a different instrument. Only call "
            "this when the user explicitly asks to look at another symbol — "
            "do not change the chart out from under them unprompted."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Ticker to load, e.g. NVDA."},
            },
            "required": ["symbol"],
        },
    },
    {
        "name": "set_resolution",
        "description": (
            "Change the chart's timeframe (e.g. switch from daily to hourly). "
            "Explicit-request only — same caveat as set_symbol."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "resolution": {
                    "type": "string",
                    "description": (
                        "TradingView resolution string: '1', '5', '15', '60' "
                        "(intraday minutes); 'D', 'W', 'M' (daily/weekly/monthly)."
                    ),
                },
            },
            "required": ["resolution"],
        },
    },
    {
        "name": "set_chart_type",
        "description": (
            "Change the chart's series style. Explicit-request only."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "type": {
                    "type": "string",
                    "enum": [
                        "candles",
                        "bars",
                        "line",
                        "area",
                        "heikin_ashi",
                        "hollow_candles",
                        "baseline",
                        "renko",
                    ],
                },
            },
            "required": ["type"],
        },
    },
    {
        "name": "set_visible_range",
        "description": (
            "Zoom the chart's time axis to a specific window — e.g. 'frame "
            "the March–May breakout' or 'show me the last 6 months'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from": {"type": "integer", "description": "Start time, UNIX seconds."},
                "to": {"type": "integer", "description": "End time, UNIX seconds."},
            },
            "required": ["from", "to"],
        },
    },
    # --- TRADING VISUALIZATION (frontend executes) ----------------------------
    {
        "name": "propose_order",
        "description": (
            "Suggest a trade by drawing a draggable order line on the chart "
            "and opening the order ticket prefilled with the same parameters. "
            "You DO NOT place the order — the user reviews the ticket and "
            "decides. Use this for 'I'd consider a long entry at $185' style "
            "suggestions; for purely informational levels use draw_horizontal_line."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "side": {"type": "string", "enum": ["buy", "sell"]},
                "type": {
                    "type": "string",
                    "enum": ["market", "limit", "stop", "stop_limit"],
                    "description": "Order type. Use 'limit' or 'stop' for level-based proposals.",
                },
                "quantity": {"type": "number", "minimum": 0.01},
                "limit_price": {"type": "number"},
                "stop_price": {"type": "number"},
                "symbol": {
                    "type": "string",
                    "description": "Optional override. Defaults to the chart's current symbol.",
                },
            },
            "required": ["side", "type", "quantity"],
        },
    },
    {
        "name": "show_position_line",
        "description": (
            "Overlay an open position as a draggable line on the chart "
            "(entry price + qty + P/L). Pass a symbol for one position, or "
            "omit to show every open position. Session-only; not persisted."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {
                    "type": "string",
                    "description": "Optional ticker. Omit to show all positions.",
                },
            },
        },
    },
    {
        "name": "mark_bar",
        "description": (
            "Drop a small icon marker on a specific bar — useful for "
            "earnings dates, news events, dividends, fills. Persisted like "
            "other drawings."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "time": {"type": "integer", "description": "UNIX seconds."},
                "text": {"type": "string", "description": "Short label / emoji (e.g. '📊 Q2 earnings')."},
                "color": {"type": "string"},
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["time", "text"],
        },
    },
    {
        "name": "mark_execution",
        "description": (
            "Mark a trade execution / fill as an arrow on the chart "
            "(direction = side). Session-only; not persisted. Use this "
            "for 'show me where I got filled' visualizations after "
            "fetching the user's activities."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "price": {"type": "number"},
                "time": {"type": "integer", "description": "UNIX seconds."},
                "side": {"type": "string", "enum": ["buy", "sell"]},
                "text": {"type": "string", "description": "Optional label, e.g. 'Filled 100 @ 184.50'."},
                "symbol": _SYMBOL_FIELD,
            },
            "required": ["price", "time", "side"],
        },
    },
    # --- COMPARISON OVERLAY (frontend executes) -------------------------------
    {
        "name": "compare_symbol",
        "description": (
            "Overlay another symbol's price series on top of the current "
            "chart for relative-performance comparison (e.g. 'overlay QQQ "
            "on NVDA'). Returns a drawing_id you can pass to remove_drawing."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "symbol": {"type": "string", "description": "Ticker to overlay, e.g. SPY."},
            },
            "required": ["symbol"],
        },
    },
    # --- CHART INSPECTION (frontend executes) ---------------------------------
    {
        "name": "get_chart_state",
        "description": (
            "Get the current chart's view state: symbol, resolution, chart "
            "type, timezone, and visible time range. Use this to ground "
            "your reasoning about what the user is currently looking at."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "inspect_chart",
        "description": (
            "List ALL shapes and studies currently on the chart, including "
            "ones the user drew manually (not just AI-created). Returns "
            "TV entity IDs you can pass to get_drawing_properties or "
            "set_drawing_properties. Different from list_drawings, which "
            "only sees AI-created records."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "get_drawing_properties",
        "description": (
            "Read the properties of a shape or study by its TV entity ID "
            "(from inspect_chart). Response shape depends on `kind`: "
            "shapes return `{ kind: 'shape', properties: {...} }`; studies "
            "return `{ kind: 'study', inputs: [{id, value}, ...], styles: "
            "{...} }`. Use for 'what period is that MA?' or 'what color "
            "is that trend line?'."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "entity_id": {"type": "string", "description": "TV entity ID from inspect_chart."},
            },
            "required": ["entity_id"],
        },
    },
    {
        "name": "set_drawing_properties",
        "description": (
            "Update an entity by its TV entity ID. For SHAPES pass any "
            "subset of TV property keys (e.g. `{linecolor: '#ff0000'}`). "
            "For STUDIES pass `{inputs: [{id, value}, ...]}` — TV's study "
            "API doesn't share the shape property bag, and study styles "
            "(colors, widths) aren't editable via this tool. "
            "EXPLICIT-REQUEST ONLY — this can edit user-drawn objects, so "
            "never restyle their work unprompted."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "entity_id": {"type": "string"},
                "properties": {
                    "type": "object",
                    "description": (
                        "Shapes: TV property key/value pairs to merge. "
                        "Studies: `{inputs: [{id, value}, ...]}` payload."
                    ),
                },
            },
            "required": ["entity_id", "properties"],
        },
    },
    {
        "name": "set_timezone",
        "description": (
            "Change the chart's display timezone (e.g. 'America/New_York', "
            "'Europe/London', 'Asia/Tokyo'). Explicit-request only."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "timezone": {"type": "string", "description": "IANA timezone ID."},
            },
            "required": ["timezone"],
        },
    },
    # --- CAPTURE / EXPORT (frontend executes) ---------------------------------
    {
        "name": "take_screenshot",
        "description": (
            "Capture the current chart as an image and return it so you "
            "can visually analyze what the user sees — price action, "
            "your own annotations, indicator readings. Useful when the "
            "user asks 'what does this look like?' or for grounding a "
            "written analysis. The image counts toward your context budget; "
            "use sparingly."
        ),
        "input_schema": {"type": "object", "properties": {}},
    },
    {
        "name": "export_chart_data",
        "description": (
            "Pull the chart's rendered bars (and optionally study values) "
            "as structured JSON for statistical analysis. Heavier than "
            "get_bars but reflects exactly what's on screen — useful when "
            "you need study/indicator values aligned to bars."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "from": {"type": "integer", "description": "Optional start time (UNIX seconds)."},
                "to": {"type": "integer", "description": "Optional end time (UNIX seconds)."},
                "include_studies": {
                    "type": "boolean",
                    "description": "Include values from chart studies (default false).",
                },
            },
        },
    },
]


def is_read_tool(name: str) -> bool:
    return name in READ_TOOL_NAMES


def is_draw_tool(name: str) -> bool:
    return name in DRAW_TOOL_NAMES


def read_only_tools(web_search: bool = False) -> list[dict[str, Any]]:
    """Subset of TOOLS exposed to the ⌘K general-purpose AI surface.
    Excludes every chart-drawing / chart-navigation / capture tool
    since there's no chart context in the command-bar modal.
    Pass web_search=True to append Anthropic's hosted web_search server tool."""
    result = [t for t in TOOLS if t["name"] in READ_TOOL_NAMES]
    if web_search:
        result.append({"type": "web_search_20250305", "name": "web_search", "max_uses": 2})
    return result


# ── Ask-anything action tools ────────────────────────────────────────────────
# Write / report tools available ONLY to the Ask anything bot (not ChartBot,
# which uses TOOLS and would mis-route any non-read tool to the frontend).
# Resolved server-side in router._execute_read_tool.
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
]

ASK_ACTION_TOOL_NAMES = {t["name"] for t in ASK_ACTION_TOOLS}


def ask_tools(web_search: bool = False) -> list[dict[str, Any]]:
    """Tool set for the Ask anything bot: read tools + watchlist/report
    action tools (+ optional hosted web_search)."""
    return read_only_tools(web_search=web_search) + ASK_ACTION_TOOLS
