"""POST /api/ai/chat — Anthropic-backed assistant for the TV chart.

Hybrid tool-use loop: the backend executes read tools on Claude's behalf
(saves frontend round-trips for pure-read reasoning), and yields control
back to the frontend the moment Claude emits a drawing tool_use. The
frontend then executes the drawings, posts the combined tool_results
back, and the loop resumes here.
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from typing import Any, Literal

import anthropic
from anthropic import APIError as AnthropicAPIError
from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel, Field

from .. import alpaca, db, market_news
from ..config import get_settings
from . import prompt, reports, tools


router = APIRouter()

_MAX_USER_MESSAGE_CHARS = 4000
_MAX_HISTORY_MESSAGES = 80


def require_ai_enabled() -> None:
    """Gate the AI endpoint behind a config toggle (operator off-switch).

    * AI_CHAT_ENABLED=false  -> 403 ("operator disabled this")
    * AI_CHAT_ENABLED=true + no ANTHROPIC_API_KEY -> 503 (same idiom as
      ``require_configured`` in main.py — frontend keys off the 503 to
      render a "not configured" state).
    """
    s = get_settings()
    if not s.ai_chat_enabled:
        raise HTTPException(403, "AI chat is disabled by configuration")
    if not s.ai_configured:
        raise HTTPException(
            503, "AI chat enabled but ANTHROPIC_API_KEY not set. See backend/.env.example"
        )


# --- Request / response models ---------------------------------------------


class ChartContext(BaseModel):
    symbol: str = Field(default="AAPL", max_length=16)
    resolution: str = Field(default="D", max_length=8)


class ChatRequest(BaseModel):
    """Pass-through of Anthropic's ``messages`` shape so the frontend can
    accumulate the conversation (assistant + tool_result blocks) without
    the backend having to reshape it on every turn."""

    messages: list[dict[str, Any]]
    chart_context: ChartContext = Field(default_factory=ChartContext)


class ChatResponse(BaseModel):
    stop_reason: str
    content: list[dict[str, Any]]
    backend_tool_results: list[dict[str, Any]] = Field(default_factory=list)
    pending_tool_use_ids: list[str] = Field(default_factory=list)
    usage: dict[str, Any] | None = None
    # Custom stop reason when the backend's own iteration cap was hit.
    backend_stopped: Literal["", "max_iterations"] = ""


# --- Backend tool dispatcher ------------------------------------------------


def _execute_read_tool(
    name: str,
    args: dict[str, Any],
    asset_class: str | None = None,
    artifacts: list[dict[str, Any]] | None = None,
) -> str:
    """Run one read/action tool and return its JSON-serialized result string.

    Returns JSON so the model parses uniformly; on failure, raises and
    the caller wraps as ``is_error`` tool_result. ``asset_class`` (the
    Ask-anything silo) defaults the silo-scoped tools (watchlist / symbol
    search) so the model sees the right universe; the ChartBot path leaves
    it None and keeps the prior all/stocks behaviour. ``artifacts`` collects
    downloadable report payloads on the Ask-anything path.
    """
    if name == "get_bars":
        symbol = str(args["symbol"]).upper()
        timeframe = str(args["timeframe"])
        limit = min(int(args.get("limit", 100)), 500)
        bars = alpaca.get_bars(symbol, timeframe, limit)
        return json.dumps({"symbol": symbol, "timeframe": timeframe, "bars": bars}, default=str)

    if name == "get_positions":
        return json.dumps({"positions": alpaca.get_positions()}, default=str)

    if name == "get_position":
        symbol = str(args["symbol"]).upper()
        return json.dumps(alpaca.get_position(symbol), default=str)

    if name == "get_orders":
        status = str(args.get("status", "open"))
        limit = min(int(args.get("limit", 25)), 100)
        return json.dumps({"orders": alpaca.get_orders(status, limit)}, default=str)

    if name == "get_account":
        return json.dumps(alpaca.get_account(), default=str)

    if name == "get_quote":
        symbol = str(args["symbol"]).upper()
        quotes = alpaca.get_latest_quotes([symbol])
        match = next((q for q in quotes if q.get("symbol") == symbol), {})
        return json.dumps(match, default=str)

    if name == "get_snapshot":
        symbol = str(args["symbol"]).upper()
        snaps = alpaca.get_snapshots([symbol])
        match = next((s for s in snaps if s.get("symbol") == symbol), {})
        return json.dumps(match, default=str)

    if name == "get_news":
        limit = min(int(args.get("limit", 10)), 50)
        sym = args.get("symbol")
        if sym:
            items = alpaca.get_news(str(sym).upper(), limit)
            return json.dumps({"symbol": str(sym).upper(), "news": items}, default=str)
        items = market_news.get_market_news(limit)
        return json.dumps({"news": items}, default=str)

    if name == "get_movers":
        top = min(int(args.get("top", 10)), 25)
        return json.dumps(alpaca.get_movers(top), default=str)

    if name == "find_symbol":
        query = str(args["query"])
        limit = min(int(args.get("limit", 10)), 25)
        # Explicit arg (cross-silo question) wins; otherwise the active silo.
        req_ac = args.get("asset_class") or asset_class
        search_class = (
            "crypto"
            if req_ac == "crypto"
            else "us_equity"
            if req_ac == "stocks"
            else ""
        )
        # Prefer the catalogue (ranked by market cap, name-searchable, enriched);
        # fall back to Alpaca's substring scan when the DB is unset/unreachable.
        matches = None
        if db.db_enabled():
            try:
                matches = db.search_assets(query, search_class, limit)
            except db.DbUnavailable:
                matches = None
        if matches is None:
            matches = alpaca.search_assets(query, limit, search_class)
        return json.dumps({"matches": matches}, default=str)

    if name == "get_activities":
        activity_type = args.get("activity_type")
        limit = min(int(args.get("limit", 25)), 100)
        return json.dumps({"activities": alpaca.get_activities(activity_type, limit)}, default=str)

    if name == "get_clock":
        return json.dumps(alpaca.get_clock(), default=str)

    if name == "get_calendar":
        start = args.get("start")
        end = args.get("end")
        return json.dumps({"calendar": alpaca.get_calendar(start, end)}, default=str)

    if name == "get_watchlist":
        # Explicit arg (cross-silo question) wins; otherwise the active silo.
        req_ac = args.get("asset_class") or asset_class
        wl_class = "crypto" if req_ac == "crypto" else ""
        return json.dumps(alpaca.get_watchlist(wl_class), default=str)

    if name == "get_corporate_actions":
        symbols = args.get("symbols")
        ca_types = args.get("types")
        since = args.get("since")
        limit = min(int(args.get("limit", 20)), 50)
        return json.dumps(
            {"corporate_actions": alpaca.get_corporate_actions(symbols, ca_types, since, limit)},
            default=str,
        )

    if name == "add_to_watchlist":
        req_ac = args.get("asset_class") or asset_class
        default_class = "crypto" if req_ac == "crypto" else ""
        added: list[str] = []
        skipped: list[dict[str, str]] = []
        for raw in args.get("symbols") or []:
            sym = str(raw).upper()
            # A pair always belongs to the crypto list regardless of silo.
            sym_class = "crypto" if "/" in sym else default_class
            try:
                asset = alpaca.get_asset(sym)
                if not asset.get("tradable"):
                    skipped.append({"symbol": sym, "reason": "not tradable"})
                    continue
                alpaca.add_to_watchlist(sym, sym_class)
                added.append(sym)
            except Exception as exc:  # noqa: BLE001 — report per-symbol failures
                skipped.append({"symbol": sym, "reason": str(exc)[:80]})
        return json.dumps({"added": added, "skipped": skipped}, default=str)

    if name == "remove_from_watchlist":
        req_ac = args.get("asset_class") or asset_class
        default_class = "crypto" if req_ac == "crypto" else ""
        removed: list[str] = []
        not_removed: list[dict[str, str]] = []
        for raw in args.get("symbols") or []:
            sym = str(raw).upper()
            sym_class = "crypto" if "/" in sym else default_class
            try:
                alpaca.remove_from_watchlist(sym, sym_class)
                removed.append(sym)
            except Exception as exc:  # noqa: BLE001
                not_removed.append({"symbol": sym, "reason": str(exc)[:80]})
        return json.dumps({"removed": removed, "not_removed": not_removed}, default=str)

    if name == "generate_report":
        kind = str(args.get("kind"))
        scope = args.get("asset_class") or asset_class or "all"
        filename, csv_text, rows = reports.build_report(kind, scope)
        if artifacts is not None:
            artifacts.append({"filename": filename, "csv": csv_text})
        return json.dumps(
            {"report": kind, "scope": scope, "rows": rows, "filename": filename,
             "download": "ready"},
            default=str,
        )

    if name == "export_csv":
        fname = str(args.get("filename") or "export.csv")
        if not fname.lower().endswith(".csv"):
            fname += ".csv"
        data_rows = args.get("rows") or []
        csv_text = reports.rows_to_csv(data_rows, args.get("columns"))
        if artifacts is not None:
            artifacts.append({"filename": fname, "csv": csv_text})
        return json.dumps(
            {"filename": fname, "rows": len(data_rows), "download": "ready"},
            default=str,
        )

    raise ValueError(f"unknown read tool: {name}")


def _block_to_dict(block: Any) -> dict[str, Any]:
    """SDK content blocks are Pydantic models; serialize for JSON return."""
    if hasattr(block, "model_dump"):
        return block.model_dump(exclude_none=True)
    return dict(block)


def _starts_with_tool_result(msg: dict[str, Any]) -> bool:
    """A user message whose first content block is a tool_result is the
    second half of a tool-use pair — dropping the matching assistant
    turn leaves Anthropic with an orphaned tool_result_id and a 400.
    """
    c = msg.get("content")
    if not isinstance(c, list) or not c:
        return False
    first = c[0]
    return isinstance(first, dict) and first.get("type") == "tool_result"


def _trim_history(messages: list[dict[str, Any]]) -> list[dict[str, Any]]:
    """Keep only the trailing _MAX_HISTORY_MESSAGES, then advance past
    any leading messages that would orphan a tool_use/tool_result pair
    so the surviving prefix is a clean user turn. If the walk-forward
    consumes every message (pathological all-tool-pairs window), fall
    back to the untouched window — the caller is in a better position
    to surface the resulting Anthropic 400 than we are to invent state.
    """
    window = messages[-_MAX_HISTORY_MESSAGES:]
    trimmed = window
    while trimmed and (
        trimmed[0].get("role") != "user" or _starts_with_tool_result(trimmed[0])
    ):
        trimmed = trimmed[1:]
    return trimmed or window


def _validate_messages(messages: list[dict[str, Any]]) -> None:
    if not messages:
        raise HTTPException(400, "messages must not be empty")
    # Lightweight length guard on plain-text user content.
    for m in messages:
        c = m.get("content")
        if isinstance(c, str) and len(c) > _MAX_USER_MESSAGE_CHARS:
            raise HTTPException(400, f"message content exceeds {_MAX_USER_MESSAGE_CHARS} chars")


# --- Endpoint ---------------------------------------------------------------


@router.post("/api/ai/chat", dependencies=[Depends(require_ai_enabled)])
def ai_chat(req: ChatRequest) -> ChatResponse:
    _validate_messages(req.messages)
    s = get_settings()
    # 60s wall-clock cap per Anthropic call — wedged connections would
    # otherwise tie up a Vercel function for the SDK default (10 min).
    client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=60.0)

    system = prompt.build_system(req.chart_context.symbol, req.chart_context.resolution)
    messages = _trim_history(list(req.messages))
    backend_results_accum: list[dict[str, Any]] = []

    for _ in range(s.ai_max_tool_iterations):
        try:
            response = client.messages.create(
                model=s.anthropic_model,
                max_tokens=s.ai_max_tokens,
                system=system,
                tools=tools.TOOLS,
                # Adaptive thinking off for v1 — keeps latency low for chat
                # workloads; the model can still tool-chain via the loop.
                thinking={"type": "disabled"},
                messages=messages,
            )
        except anthropic.AuthenticationError as e:
            # 401 from Anthropic = our key is invalid/revoked. Surface as
            # 503 so it lines up with the "not configured" idiom the
            # frontend already handles, with a clear pointer at the cause.
            raise HTTPException(
                503,
                f"Anthropic API key invalid or revoked. Check ANTHROPIC_API_KEY: {e}",
            )
        except AnthropicAPIError as e:
            status = getattr(e, "status_code", None) or 502
            raise HTTPException(status, f"Anthropic error: {e}")

        content_dicts = [_block_to_dict(b) for b in response.content]
        usage = response.usage.model_dump() if response.usage else None

        if response.stop_reason != "tool_use":
            return ChatResponse(
                stop_reason=response.stop_reason or "end_turn",
                content=content_dicts,
                backend_tool_results=backend_results_accum,
                pending_tool_use_ids=[],
                usage=usage,
            )

        # Partition tool_uses into backend (read) vs frontend (draw).
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        pending_frontend = [t for t in tool_uses if not tools.is_read_tool(t.name)]
        backend_uses = [t for t in tool_uses if tools.is_read_tool(t.name)]

        new_backend_results: list[dict[str, Any]] = []
        for tu in backend_uses:
            try:
                result_str = _execute_read_tool(tu.name, dict(tu.input))
                new_backend_results.append(
                    {"type": "tool_result", "tool_use_id": tu.id, "content": result_str}
                )
            except Exception as exc:  # noqa: BLE001 — surface every failure to model
                new_backend_results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": f"error: {exc}",
                        "is_error": True,
                    }
                )

        if pending_frontend:
            # Frontend has work to do; hand back the assistant message + the
            # already-resolved backend results so the frontend can complete
            # the tool_result set in one go.
            return ChatResponse(
                stop_reason="tool_use",
                content=content_dicts,
                backend_tool_results=backend_results_accum + new_backend_results,
                pending_tool_use_ids=[t.id for t in pending_frontend],
                usage=usage,
            )

        # All tool_uses were backend-executable: continue the loop.
        messages.append({"role": "assistant", "content": content_dicts})
        messages.append({"role": "user", "content": new_backend_results})
        backend_results_accum = []  # consumed by the messages we just appended

    # Iteration cap reached without natural stop. Hand back whatever we
    # produced; frontend can prompt the user to ask again.
    return ChatResponse(
        stop_reason="tool_use",
        content=[],
        backend_tool_results=backend_results_accum,
        pending_tool_use_ids=[],
        usage=None,
        backend_stopped="max_iterations",
    )


# --- ⌘K general-purpose ask endpoint ----------------------------------------
# Smaller surface area than /api/ai/chat: no frontend tools, no per-request
# chart context, no streaming. One-shot Q&A with backend reads grounding the
# answer. The modal clears its transcript on close, so history is bounded
# in practice — we still trim defensively.


class AskRequest(BaseModel):
    message: str = Field(min_length=1, max_length=_MAX_USER_MESSAGE_CHARS)
    # Optional prior turns (same Anthropic message shape) so multi-step
    # follow-ups in the same modal session can resolve.
    history: list[dict[str, Any]] = Field(default_factory=list)
    # Active silo so the model steers to the right symbols / news / tools.
    asset_class: Literal["stocks", "crypto"] | None = None


class AskToolCall(BaseModel):
    name: str
    ok: bool


class AskReport(BaseModel):
    filename: str
    csv: str


class AskResponse(BaseModel):
    text: str
    tool_calls: list[AskToolCall] = Field(default_factory=list)
    reports: list[AskReport] = Field(default_factory=list)
    usage: dict[str, Any] | None = None
    backend_stopped: Literal["", "max_iterations"] = ""


@router.post("/api/ai/ask", dependencies=[Depends(require_ai_enabled)])
def ai_ask(req: AskRequest) -> AskResponse:
    s = get_settings()
    client = anthropic.Anthropic(api_key=s.anthropic_api_key, timeout=60.0)

    now_utc = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")
    context = f"Current time: {now_utc}."
    if req.asset_class:
        active = "crypto" if req.asset_class == "crypto" else "stocks (US equities)"
        other = "stocks (US equities)" if req.asset_class == "crypto" else "crypto"
        context += (
            f" The user is in the {active} silo; default every answer to {active}"
            f" — prefer {active} symbols, watchlist and news. The structured"
            " shortcuts are silo-specific by design. You CAN still answer"
            f" cross-silo or whole-account questions: get_positions, get_orders"
            " and get_account already cover the whole account, and get_watchlist"
            " / find_symbol take an asset_class argument to target the other"
            f" silo. Only reach into {other} when the user explicitly asks about"
            f" it or the overall account — never pull {other} data proactively"
            f" during normal {active} questions."
        )
        if req.asset_class == "crypto":
            context += (
                " get_movers returns STOCK movers only (Alpaca has no crypto"
                " screener) — call it only if the user asks about stocks."
            )
    context += (
        " You can edit the watchlist (add_to_watchlist / remove_from_watchlist,"
        " bulk) — validate symbols are tradable before adding. For themed/sector"
        " lists (e.g. 'top 10 pharma stocks') name the tickers from your own"
        " knowledge, then validate. generate_report builds a downloadable CSV"
        " for the standard account reports (positions/orders/activities/pnl)."
        " For ANY other readable data the user wants exported — price history"
        " (call get_bars first), quotes, news, watchlist, movers, a custom"
        " table — fetch it then call export_csv with the COMPLETE rows. Either"
        " way, tell the user the file is ready to download rather than pasting"
        " the rows."
    )
    # Internal-first: the model must use its own tools/knowledge by default and
    # only treat web search as a last resort (and only when it's enabled).
    context += (
        " Always answer from your own tools (get_positions, get_quote, get_news,"
        " get_movers, etc.) and your own knowledge first — that is enough for"
        " almost every request."
    )
    if s.ai_web_search_enabled:
        context += (
            " web_search exists only as a last resort, for current external"
            " information you genuinely cannot get from your tools or knowledge;"
            " do not use it for symbols, prices, news or lists you can already"
            " produce."
        )
    system = prompt.build_general_system(context=context)
    tool_list = tools.ask_tools(web_search=s.ai_web_search_enabled)
    messages = _trim_history(
        list(req.history) + [{"role": "user", "content": req.message}]
    )

    tool_calls: list[AskToolCall] = []
    artifacts: list[dict[str, Any]] = []

    def _create():
        return client.messages.create(
            model=s.anthropic_model,
            max_tokens=s.ai_max_tokens,
            system=system,
            tools=tool_list,
            thinking={"type": "disabled"},
            messages=messages,
        )

    for _ in range(s.ai_max_tool_iterations):
        try:
            response = _create()
        except anthropic.AuthenticationError as e:
            raise HTTPException(
                503,
                f"Anthropic API key invalid or revoked. Check ANTHROPIC_API_KEY: {e}",
            )
        except AnthropicAPIError as e:
            # Hosted web_search 400s if the org hasn't enabled it. Drop the tool
            # and retry so the bot just answers from its own tools/knowledge
            # instead of surfacing an error.
            if "web search is not enabled" in str(e).lower() and any(
                t.get("name") == "web_search" for t in tool_list
            ):
                tool_list = [t for t in tool_list if t.get("name") != "web_search"]
                try:
                    response = _create()
                except AnthropicAPIError as e2:
                    raise HTTPException(
                        getattr(e2, "status_code", None) or 502,
                        f"Anthropic error: {e2}",
                    )
            else:
                status = getattr(e, "status_code", None) or 502
                raise HTTPException(status, f"Anthropic error: {e}")

        content_dicts = [_block_to_dict(b) for b in response.content]
        usage = response.usage.model_dump() if response.usage else None

        # Track Anthropic-executed server tools (e.g. web_search) for badge display.
        for b in response.content:
            if getattr(b, "type", None) == "server_tool_use":
                tool_calls.append(AskToolCall(name=getattr(b, "name", "web_search"), ok=True))

        if response.stop_reason != "tool_use":
            text = "".join(
                b.text for b in response.content if b.type == "text"
            )
            return AskResponse(
                text=text,
                tool_calls=tool_calls,
                reports=[AskReport(**a) for a in artifacts],
                usage=usage,
            )

        # Resolve every backend tool inline — the ask tool set has no
        # frontend tools, so the loop stays server-side.
        tool_uses = [b for b in response.content if b.type == "tool_use"]
        results: list[dict[str, Any]] = []
        for tu in tool_uses:
            try:
                result_str = _execute_read_tool(
                    tu.name, dict(tu.input), asset_class=req.asset_class,
                    artifacts=artifacts,
                )
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": result_str,
                    }
                )
                tool_calls.append(AskToolCall(name=tu.name, ok=True))
            except Exception as exc:  # noqa: BLE001 — surface every failure
                results.append(
                    {
                        "type": "tool_result",
                        "tool_use_id": tu.id,
                        "content": f"error: {exc}",
                        "is_error": True,
                    }
                )
                tool_calls.append(AskToolCall(name=tu.name, ok=False))

        messages.append({"role": "assistant", "content": content_dicts})
        messages.append({"role": "user", "content": results})

    return AskResponse(
        text="(stopped after reaching the tool-use iteration limit — try a more direct question)",
        tool_calls=tool_calls,
        reports=[AskReport(**a) for a in artifacts],
        usage=None,
        backend_stopped="max_iterations",
    )
