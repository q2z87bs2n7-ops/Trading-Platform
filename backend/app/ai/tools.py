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
}

# Drawing tools — backend declares, frontend executes
DRAW_TOOL_NAMES = {
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
]


def is_read_tool(name: str) -> bool:
    return name in READ_TOOL_NAMES


def is_draw_tool(name: str) -> bool:
    return name in DRAW_TOOL_NAMES
