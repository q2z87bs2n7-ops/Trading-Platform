"""JSON-schema tool declarations exposed to Claude.

Two halves: read tools run on the backend (wrap existing alpaca helpers);
drawing tools run on the frontend against IChartWidgetApi. The model sees
one unified tool list and doesn't care which side executes — the
dispatcher in ``router`` does that split.

The schemas live in focused modules — ``tools_read`` (backend), ``tools_draw``
(frontend), ``tools_action`` (Ask-anything write/report tools) — and this
module assembles the public API. ``TOOLS`` order is load-bearing: it forms part
of the cache-marked system prefix sent to Anthropic (see ``prompt.py``), so the
read-tools-then-draw-tools ordering must not change.
"""

from typing import Any

from .tools_action import ASK_ACTION_TOOL_NAMES, ASK_ACTION_TOOLS
from .tools_draw import DRAW_TOOL_NAMES, DRAW_TOOLS
from .tools_read import READ_TOOL_NAMES, READ_TOOLS
from .tools_workspace import WORKSPACE_TOOL_NAMES, WORKSPACE_TOOLS

__all__ = [
    "TOOLS",
    "READ_TOOL_NAMES",
    "DRAW_TOOL_NAMES",
    "ASK_ACTION_TOOLS",
    "ASK_ACTION_TOOL_NAMES",
    "WORKSPACE_TOOLS",
    "WORKSPACE_TOOL_NAMES",
    "is_read_tool",
    "is_draw_tool",
    "read_only_tools",
    "ask_tools",
]

TOOLS: list[dict[str, Any]] = READ_TOOLS + DRAW_TOOLS


def is_read_tool(name: str) -> bool:
    return name in READ_TOOL_NAMES


def is_draw_tool(name: str) -> bool:
    return name in DRAW_TOOL_NAMES


def read_only_tools(web_search: bool = False) -> list[dict[str, Any]]:
    """Subset of TOOLS exposed to the Ask anything general-purpose AI surface.
    Excludes every chart-drawing / chart-navigation / capture tool
    since there's no chart context in the Ask anything modal.
    Pass web_search=True to append Anthropic's hosted web_search server tool."""
    result = [t for t in TOOLS if t["name"] in READ_TOOL_NAMES]
    if web_search:
        result.append({"type": "web_search_20250305", "name": "web_search", "max_uses": 2})
    return result


def ask_tools(web_search: bool = False) -> list[dict[str, Any]]:
    """Tool set for the Ask anything bot: read tools + watchlist/report
    action tools + Workspace control tools (+ optional hosted web_search)."""
    return read_only_tools(web_search=web_search) + ASK_ACTION_TOOLS + WORKSPACE_TOOLS
