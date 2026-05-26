"""Ask-anything Workspace control tool schemas.

Available ONLY to the Ask anything bot (not ChartBot, which uses ``TOOLS``).
These tools don't run server-side — each records a *client directive* (see
``router._execute_read_tool``, appended to the ``workspace_actions``
accumulator) that the frontend replays against the Workspace controller, much
like ``generate_report`` queues a downloadable CSV into ``artifacts``. Schema
text is load-bearing for Anthropic prefix-cache hits — append, don't reorder.
"""

from typing import Any

WORKSPACE_PRESETS = ("trader", "researcher", "watcher", "focus")
WORKSPACE_CHANNELS = ("main", "blue", "green", "amber")
WORKSPACE_WIDGET_KINDS = (
    "chart",
    "minichart",
    "watchlist",
    "trade",
    "account",
    "positions",
    "orders",
    "activity",
    "news",
    "profile",
    "earnings",
    "fundamentals",
    "trending",
    "smartscore",
    "sentiment",
    "analysts",
    "hedgefunds",
    "insiders",
)

_SILO_PROP = {
    "type": "string",
    "enum": ["stocks", "crypto"],
    "description": (
        "Target silo. Omit for the user's active silo; set only to target the "
        "other silo (the app will switch silos first)."
    ),
}

_CHANNEL_PROP = {
    "type": "string",
    "enum": list(WORKSPACE_CHANNELS),
    "description": (
        "Shared link channel. Widgets on the same channel show the same symbol; "
        "'main' tracks the app-wide selected symbol."
    ),
}

WORKSPACE_TOOLS: list[dict[str, Any]] = [
    {
        "name": "set_workspace_layout",
        "description": (
            "Apply one of the named Workspace layout presets (replaces the "
            "current arrangement). Use for 'trader/researcher/watcher/focus "
            "layout'. For an arbitrary custom arrangement use "
            "build_workspace_layout instead."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "preset": {"type": "string", "enum": list(WORKSPACE_PRESETS)},
                "silo": _SILO_PROP,
            },
            "required": ["preset"],
        },
    },
    {
        "name": "set_channel_instrument",
        "description": (
            "Point a shared link channel at an instrument; every widget bound to "
            "that channel follows. Resolve the symbol first (find_symbol / your "
            "own knowledge)."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "channel": _CHANNEL_PROP,
                "symbol": {
                    "type": "string",
                    "description": "Ticker (AAPL) or crypto pair (BTC/USD).",
                },
                "silo": _SILO_PROP,
            },
            "required": ["channel", "symbol"],
        },
    },
    {
        "name": "add_workspace_widget",
        "description": (
            "Add one widget to the current canvas. For a chart/minichart pass a "
            "symbol to pin it (standalone, owns its symbol) or a channel to link "
            "it; data widgets (positions/orders/activity/account/news) default "
            "to whole-account when no channel is given. 'profile' shows "
            "fundamentals (stocks) or tokenomics (crypto) for one symbol — it is "
            "symbol-linked like trade, so give it a channel. 'earnings' shows a "
            "symbol's report history when given a channel, or the market-wide "
            "earnings calendar when left whole-account (no channel). "
            "'fundamentals' shows annual statement metrics for one STOCK "
            "(revenue & net-income trend, valuation, margins, growth, dividend) "
            "— stocks-only and symbol-linked, so give it a channel. "
            "'trending' shows top trending stocks by analyst coverage "
            "(stocks-only, no symbol input); a row click writes the picked "
            "ticker into the widget's channel. "
            "'smartscore' shows the Tipranks composite signal (1-10) plus the "
            "six input components (hedge-fund flow, blogger sentiment, news "
            "sentiment, insider activity, investor holding deltas) for one "
            "STOCK — symbol-linked, so give it a channel. "
            "'sentiment' shows combined blogger / news / Tipranks-investor "
            "sentiment for one STOCK — symbol-linked. "
            "'analysts' shows the per-analyst ratings list (firm, "
            "recommendation, date) for one STOCK — symbol-linked, drills "
            "down from the aggregate consensus in Trending. "
            "'hedgefunds' shows 13F-derived hedge-fund flow for one STOCK: "
            "rating + confidence + last-quarter net shares + top movers + "
            "quarterly trend — symbol-linked. "
            "'insiders' shows Form-4 insider transactions for one STOCK: "
            "trend, monthly buy/sell bars, recent named-insider rows — "
            "symbol-linked."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "widget": {"type": "string", "enum": list(WORKSPACE_WIDGET_KINDS)},
                "symbol": {
                    "type": "string",
                    "description": (
                        "The instrument to show. Passed WITH a channel it points "
                        "that channel at the symbol, so every widget on the "
                        "channel (profile/positions/orders/chart…) follows it; a "
                        "chart/minichart symbol WITHOUT a channel is pinned "
                        "standalone."
                    ),
                },
                "channel": _CHANNEL_PROP,
                "silo": _SILO_PROP,
            },
            "required": ["widget"],
        },
    },
    {
        "name": "remove_workspace_widget",
        "description": (
            "Remove a widget from the canvas, by exact panel id or by the last "
            "widget of a given kind."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "widget": {"type": "string", "enum": list(WORKSPACE_WIDGET_KINDS)},
                "panel_id": {"type": "string"},
                "silo": _SILO_PROP,
            },
        },
    },
    {
        "name": "build_workspace_layout",
        "description": (
            "Build a custom Workspace layout from scratch (clears the canvas). "
            "This is the tool for requests like 'watch the 7 best tech names' or "
            "'show me a grid of these charts': resolve the symbols first "
            "(find_symbol / screen_assets / your knowledge), then list one widget "
            "per panel — usually a 'chart' per instrument with its own symbol. "
            "The app sizes the grid responsively to the user's viewport; only set "
            "'columns' to force a specific shape. To pair widgets on one "
            "instrument (e.g. a chart + a 'profile' per stock), give each "
            "instrument its own channel (main/blue/green/amber): put the symbol "
            "on that instrument's chart with the channel, and give its profile "
            "(and any positions/orders) the same channel with no symbol — they "
            "all follow. Only four channels exist, so at most four distinct "
            "channel-linked instruments; standalone charts (symbol, no channel) "
            "have no such limit."
        ),
        "input_schema": {
            "type": "object",
            "properties": {
                "widgets": {
                    "type": "array",
                    "description": "One entry per panel, in reading order.",
                    "items": {
                        "type": "object",
                        "properties": {
                            "kind": {
                                "type": "string",
                                "enum": list(WORKSPACE_WIDGET_KINDS),
                            },
                            "symbol": {
                                "type": "string",
                                "description": (
                                    "This panel's instrument. WITH a channel it "
                                    "points that channel at the symbol, so every "
                                    "panel sharing the channel follows (e.g. a "
                                    "chart + profile column on one channel). A "
                                    "chart/minichart symbol with NO channel is "
                                    "standalone (owns its symbol)."
                                ),
                            },
                            "channel": _CHANNEL_PROP,
                        },
                        "required": ["kind"],
                    },
                },
                "arrangement": {
                    "type": "string",
                    "enum": ["grid", "focus", "columns", "rows"],
                    "description": "Default 'grid' (responsive).",
                },
                "columns": {
                    "type": "integer",
                    "description": "Force a column count; omit to size to the viewport.",
                },
                "silo": _SILO_PROP,
            },
            "required": ["widgets"],
        },
    },
]

WORKSPACE_TOOL_NAMES = {t["name"] for t in WORKSPACE_TOOLS}
