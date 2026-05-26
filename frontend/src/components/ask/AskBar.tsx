import { useEffect, useMemo, useRef, useState } from "react";

import type { AiAskMessage, AiAskResponse } from "../../api";
import {
  routeQuery,
  extractSymbols,
  type AssetClass,
  type Intent,
} from "../../lib/ask-intent";
import { isCryptoPosition } from "../../lib/asset-class";
import type { Position } from "../../types";
import {
  useCryptoWatchlist,
  usePositions,
  useSymbolUniverse,
  useWatchlist,
} from "../../data/hooks";
import { useFirstOpenHint } from "../../hooks/useFirstOpenHint";
import { useSettings } from "../../hooks/useSettings";
import { useMobile } from "../../hooks/useMobile";
import { useSpeechToText } from "../../hooks/useSpeechToText";
import MicButton from "../MicButton";
import { AskResult } from "./cards";

interface Turn {
  id: number;
  query: string;
  intent: Intent;
  // Snapshot of the AI conversation as of this turn, passed to the fallback
  // bot so it can see earlier exchanges in the same modal session.
  history: AiAskMessage[];
  // Populated for resolved fallback turns so a remount (e.g. reopen the
  // modal, reload the page) can replay the answer without re-firing the
  // Anthropic call.
  cachedResp?: AiAskResponse;
}

// Keep the trailing N messages so multi-turn context stays bounded.
const HISTORY_CAP = 16;

const STORAGE_KEY = "ask_session_v1";
const STORAGE_BUDGET_BYTES = 256 * 1024;

interface Persisted {
  turns: Turn[];
  apiHistory: AiAskMessage[];
}

function loadPersisted(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { turns: [], apiHistory: [] };
    const p = JSON.parse(raw) as { turns?: unknown; apiHistory?: unknown };
    const turns = Array.isArray(p.turns) ? (p.turns as Turn[]) : [];
    const apiHistory = Array.isArray(p.apiHistory) ? (p.apiHistory as AiAskMessage[]) : [];
    return { turns, apiHistory };
  } catch {
    return { turns: [], apiHistory: [] };
  }
}

function savePersisted(turns: Turn[], apiHistory: AiAskMessage[]) {
  let t = turns;
  let h = apiHistory;
  for (let guard = 0; guard < 200; guard++) {
    const payload = JSON.stringify({ turns: t, apiHistory: h });
    if (payload.length <= STORAGE_BUDGET_BYTES) {
      try { localStorage.setItem(STORAGE_KEY, payload); } catch { /* quota */ }
      return;
    }
    if (t.length === 0) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      return;
    }
    // Drop the oldest turn (and its matching user+assistant pair if any).
    t = t.slice(1);
    h = h.length >= 2 ? h.slice(2) : [];
  }
}

// Display label for a symbol — strips the /USD quote off crypto pairs.
const coin = (s: string) => (s.includes("/") ? s.split("/")[0] : s);

// Top position by absolute unrealised P/L (coin label), if the silo holds any.
function topHoldingLabel(positions?: Position[]): string | undefined {
  if (!positions?.length) return undefined;
  const sorted = [...positions].sort(
    (a, b) => Math.abs(b.unrealized_pl) - Math.abs(a.unrealized_pl),
  );
  return coin(sorted[0].symbol);
}

// First watchlist symbol not already held (coin label), if any.
function freshWatchlistLabel(
  watchlist?: string[],
  positions?: Position[],
): string | undefined {
  const held = new Set(positions?.map((p) => p.symbol) ?? []);
  const sym = (watchlist ?? []).find((s) => !held.has(s));
  return sym ? coin(sym) : undefined;
}

interface ChipGroup {
  label: string;
  chips: string[];
}

// Empty-state suggestion chips, grouped by skill so the less-obvious
// capabilities (workspace layouts, watchlist edits, CSV export, AI research)
// are visible — not just trade/portfolio/news. Every group is silo-tailored;
// the AI-routed groups are hidden when the Ask bot is disabled because they'd
// otherwise land on the "enable AI" notice.
function buildCapabilityGroups(
  positions: Position[] | undefined,
  watchlist: string[] | undefined,
  assetClass: AssetClass,
  aiEnabled: boolean,
): ChipGroup[] {
  const crypto = assetClass === "crypto";
  const holding = topHoldingLabel(positions);
  const wlSym = freshWatchlistLabel(watchlist, positions);

  const groups: ChipGroup[] = [
    {
      label: "Market pulse",
      chips: [crypto ? "Crypto summary" : "Market summary", "Top gainers", "What changed today?"],
    },
    {
      label: "Your portfolio",
      chips: [
        holding ? `How's my ${holding}?` : "Portfolio",
        "Open orders",
        ...(wlSym ? [`News on ${wlSym}`] : []),
      ],
    },
    {
      label: "Quick trade",
      chips: [
        crypto ? "Buy 0.1 ETH" : "Buy 50 AMD at market",
        ...(holding ? [`Close my ${holding}`] : []),
      ],
    },
    {
      label: "Your workspace",
      chips: crypto
        ? ["Watcher layout", "Watch BTC/USD ETH/USD SOL/USD", "Set blue to ETH/USD"]
        : ["Trader layout", "Watch AAPL NVDA TSLA", "Set blue to NVDA"],
    },
  ];

  // Research / watchlist edits / exports all run through the AI fallback bot,
  // so only advertise them when it's switched on.
  if (aiEnabled) {
    groups.push(
      {
        label: "Deep dive",
        chips: crypto
          ? ["What is Solana?", "Why is BTC moving today?"]
          : ["What's NVDA's P/E?", "Why is AAPL up today?"],
      },
      {
        label: "Curate a watchlist",
        chips: crypto
          ? ["Add the top 5 layer-1 coins", "Remove DOGE from my watchlist"]
          : ["Add the top 10 AI stocks", "Remove TSLA from my watchlist"],
      },
      {
        label: "Export & share",
        chips: crypto
          ? ["Export my crypto activity to CSV", "Download my P/L history"]
          : ["Export my activity to CSV", "Download my P/L history"],
      },
    );
  }

  // Global dedup by label so a symbol shared across positions/watchlist can't
  // surface the same chip twice (the old flat list could repeat "News on …").
  const seen = new Set<string>();
  for (const g of groups) {
    g.chips = g.chips.filter((c) => {
      const k = c.toLowerCase();
      if (seen.has(k)) return false;
      seen.add(k);
      return true;
    });
  }
  return groups.filter((g) => g.chips.length > 0);
}

// One-line plain-English nudge under the chips — the "I can also…" hint.
// Silo-specific, and trims the AI-only skills when the bot is off.
function capabilityHint(assetClass: AssetClass, aiEnabled: boolean): string {
  const crypto = assetClass === "crypto";
  if (!aiEnabled) {
    return crypto
      ? "Just tell it what you want — pull up any chart, fire off a trade, scan the day's hottest crypto movers, and snap together your own multi-panel workspace in seconds. No menus, no hunting."
      : "Just tell it what you want — pull up any chart, fire off a trade, scan the day's biggest market movers, and snap together your own multi-panel workspace in seconds. No menus, no hunting.";
  }
  return crypto
    ? "Just tell it what you want — and it does far more than the chips above. Pull charts and place trades, dig into tokenomics & technicals, spin up multi-chart layouts, build themed watchlists on command, and export anything to CSV — all in plain English."
    : "Just tell it what you want — and it does far more than the chips above. Pull charts and place trades, dig into fundamentals, earnings & technicals, spin up multi-chart layouts, build themed watchlists on command, and export anything to CSV — all in plain English.";
}

function buildFollowups(
  lastIntent: Intent | null,
  aiResp: AiAskResponse | null,
  assetClass: AssetClass,
): string[] {
  const summaryChip = assetClass === "crypto" ? "Crypto summary" : "Market summary";

  // For AI fallback turns: derive chips from the actual response content.
  if (lastIntent?.type === "fallback" && aiResp) {
    const chips: string[] = [];
    const toolNames = new Set(aiResp.tool_calls.filter((t) => t.ok).map((t) => t.name));
    const syms = extractSymbols(aiResp.text);

    if (syms[0]) chips.push(`Chart ${coin(syms[0])}`);
    if (syms[1]) chips.push(`News on ${coin(syms[1])}`);
    if (toolNames.has("get_positions") || toolNames.has("get_account")) chips.push("Portfolio");
    if (toolNames.has("get_orders")) chips.push("Open orders");
    if (toolNames.has("get_movers")) chips.push("What changed today?");

    for (const f of ["Top gainers", "Open orders", "Portfolio", summaryChip]) {
      if (chips.length >= 4) break;
      if (!chips.includes(f)) chips.push(f);
    }
    return chips.slice(0, 4);
  }

  // For structured intents: context-aware static chips.
  switch (lastIntent?.type) {
    case "order":
      return ["Portfolio", `How's ${coin(lastIntent.symbol)}?`, "Open orders", "Top gainers"];
    case "close":
      return ["Portfolio", "Open orders", "What changed today?", "Top gainers"];
    case "portfolio":
      return ["Open orders", "Top gainers", summaryChip, "What changed today?"];
    case "movers":
      return [summaryChip, "Portfolio", "Open orders", "What changed today?"];
    case "news":
      return lastIntent.symbol
        ? [`Chart ${coin(lastIntent.symbol)}`, "Top gainers", "Portfolio", "Open orders"]
        : [summaryChip, "Top gainers", "Portfolio", "What changed today?"];
    case "orders":
      return ["Portfolio", "Top gainers", summaryChip, "What changed today?"];
    case "chart":
      return [`News on ${coin(lastIntent.symbol)}`, "Portfolio", "Top gainers", "Open orders"];
    case "market_summary":
      return ["Top gainers", "Portfolio", "Open orders", "What changed today?"];
    default:
      return ["What changed today?", "Top gainers", "Open orders", "Portfolio"];
  }
}

interface Props {
  open: boolean;
  assetClass: AssetClass;
  onClose: () => void;
  onOpenInWorkspace: (symbol: string) => void;
}

export default function AskBar({ open, assetClass, onClose, onOpenInWorkspace }: Props) {
  const [text, setText] = useState("");
  const [interim, setInterim] = useState("");
  const speech = useSpeechToText({
    onAppend: (delta) => setText((t) => t + delta),
    onInterim: setInterim,
  });
  // Combined cache: turns (rendered transcript) + apiHistory (model context).
  // Persisted to localStorage so reopens / reloads keep prior Q&A without
  // re-billing Anthropic for already-resolved turns.
  const [state, setState] = useState<Persisted>(loadPersisted);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const counter = useRef(
    state.turns.reduce((m, t) => (t.id > m ? t.id : m), 0),
  );
  const turns = state.turns;

  const { data: posData } = usePositions();
  const { data: wl } = useWatchlist();
  const { data: cryptoWl } = useCryptoWatchlist();
  const symbolUniverse = useSymbolUniverse();
  const aiEnabled = useSettings().askAiEnabled;
  const isMobile = useMobile();
  const askHint = useFirstOpenHint("ask_convention");

  const siloPositions = useMemo(
    () =>
      (posData?.positions ?? []).filter((p) =>
        assetClass === "crypto" ? isCryptoPosition(p) : !isCryptoPosition(p),
      ),
    [posData, assetClass],
  );
  const siloWatchlist =
    assetClass === "crypto" ? cryptoWl?.symbols : wl?.symbols;

  const capabilityGroups = useMemo(
    () => buildCapabilityGroups(siloPositions, siloWatchlist, assetClass, aiEnabled),
    // Recompute when data arrives or the modal reopens.
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [siloPositions, siloWatchlist, assetClass, aiEnabled, open],
  );
  const hint = useMemo(
    () => capabilityHint(assetClass, aiEnabled),
    [assetClass, aiEnabled],
  );

  const lastTurn = turns[turns.length - 1];
  // Followups for the last AI turn read its cached response directly —
  // no separate state needed, and they survive reloads alongside the turn.
  const lastFallbackResp =
    lastTurn && lastTurn.intent.type === "fallback"
      ? lastTurn.cachedResp ?? null
      : null;
  const followups = useMemo(
    () => buildFollowups(lastTurn?.intent ?? null, lastFallbackResp, assetClass),
    [lastTurn?.id, lastFallbackResp, assetClass],
  );

  // Persist cache whenever it changes. Strict-Mode-safe (idempotent write).
  useEffect(() => {
    savePersisted(state.turns, state.apiHistory);
  }, [state]);

  // Focus the textarea each time the modal opens; reset only the composer
  // on close — transcript + apiHistory persist until the user clicks Clear.
  useEffect(() => {
    if (open) {
      const id = setTimeout(() => inputRef.current?.focus(), 30);
      return () => clearTimeout(id);
    }
    setText("");
    setInterim("");
    speech.stop();
  }, [open]);

  // ESC closes.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Lock body scroll while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  // Auto-scroll transcript when a new turn lands — and on reopen, since
  // the cache may already hold prior turns to surface.
  useEffect(() => {
    if (!open || !scrollRef.current) return;
    scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [turns.length, open]);

  // Attach the resolved AI response to its turn and extend apiHistory so
  // the next turn keeps multi-turn context. Called once per fallback turn,
  // and only on a live (non-cached) resolution — replaying from the cache
  // does not re-invoke this.
  function handleResolved(turnId: number, resp: AiAskResponse) {
    setState((s) => {
      const turn = s.turns.find((t) => t.id === turnId);
      if (!turn || turn.intent.type !== "fallback") return s;
      const nextTurns = s.turns.map((t) =>
        t.id === turnId ? { ...t, cachedResp: resp } : t,
      );
      if (!resp.text) return { ...s, turns: nextTurns };
      const nextHistory: AiAskMessage[] = [
        ...s.apiHistory,
        { role: "user" as const, content: turn.intent.text },
        { role: "assistant" as const, content: resp.text },
      ].slice(-HISTORY_CAP);
      return { turns: nextTurns, apiHistory: nextHistory };
    });
  }

  function clear() {
    setState({ turns: [], apiHistory: [] });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
    counter.current = 0;
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  function submit(value: string) {
    const trimmed = value.trim();
    if (!trimmed) return;
    if (speech.listening) speech.stop();
    counter.current += 1;
    const intent = routeQuery(trimmed, { assetClass, aiEnabled, symbolUniverse });
    // Drop the force-AI prefix from the displayed query bubble.
    const display = trimmed.replace(/^(?:ai|ask):\s*/i, "");
    const id = counter.current;
    setState((s) => ({
      ...s,
      turns: [
        ...s.turns,
        {
          id,
          query: display,
          intent,
          // Snapshot the conversation so far for this turn's AI call.
          history: [...s.apiHistory],
        },
      ],
    }));
    setText("");
    setInterim("");
    // Refocus so the user can keep typing follow-ups without re-clicking.
    requestAnimationFrame(() => inputRef.current?.focus());
  }

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50"
      style={{
        background: "rgba(20, 22, 28, 0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="mx-auto flex flex-col"
        style={{
          marginTop: isMobile ? 0 : "10vh",
          maxWidth: isMobile ? "100%" : 680,
          width: isMobile ? "100%" : "calc(100% - 32px)",
          maxHeight: isMobile ? "100dvh" : "80vh",
          height: isMobile ? "100dvh" : "auto",
          paddingTop: isMobile ? "var(--safe-top)" : undefined,
          background: "var(--panel)",
          borderRadius: isMobile ? 0 : "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          overflow: "hidden",
          animation: "ask-up 180ms ease",
        }}
      >
        <style>{`@keyframes ask-up{from{transform:translateY(-20px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        {/* Header — sparkle brand + close. Keeps a small top frame around
           the transcript without putting input controls up here. */}
        <div
          className="flex items-center gap-2 px-4 py-2.5"
          style={{ borderBottom: "1px solid var(--hairline)" }}
        >
          <span
            className="text-[16px]"
            style={{ color: "var(--accent)" }}
            aria-hidden
          >
            ✦
          </span>
          <span
            className="text-[12px] font-semibold uppercase"
            style={{ color: "var(--mute)", letterSpacing: "0.06em" }}
          >
            Ask anything
          </span>
          {turns.length > 0 && (
            <button
              type="button"
              onClick={clear}
              aria-label="Clear chat"
              title="Clear chat"
              className="ml-auto cursor-pointer text-[11.5px] font-medium"
              style={{
                background: "var(--panel-2)",
                color: "var(--text-2)",
                border: "1px solid var(--border)",
                height: 28,
                padding: "0 10px",
                borderRadius: 6,
              }}
            >
              Clear
            </button>
          )}
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className={`${turns.length > 0 ? "" : "ml-auto "}cursor-pointer border-0 text-[14px] grid place-items-center`}
            style={{
              background: "var(--panel-2)",
              color: "var(--text-2)",
              width: 28,
              height: 28,
              borderRadius: 6,
            }}
          >
            ✕
          </button>
        </div>

        {/* Transcript / empty state — fills the middle and scrolls. */}
        <div
          ref={scrollRef}
          className="flex-1 overflow-y-auto px-4 py-4"
          style={{ background: "var(--bg)" }}
        >
          {turns.length === 0 ? (
            <div className="flex flex-col gap-4">
              {capabilityGroups.map((g) => (
                <div key={g.label}>
                  <div
                    className="text-[11px] uppercase mb-2"
                    style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
                  >
                    {g.label}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {g.chips.map((s) => (
                      <button
                        key={s}
                        type="button"
                        onClick={() => submit(s)}
                        className="text-[13px] cursor-pointer transition-colors"
                        style={{
                          padding: isMobile ? "12px 14px" : "8px 12px",
                          minHeight: isMobile ? "var(--mob-tap)" : undefined,
                          width: isMobile ? "100%" : "auto",
                          textAlign: isMobile ? "left" : "center",
                          background: "var(--panel)",
                          border: "1px solid var(--border)",
                          color: "var(--text-2)",
                          borderRadius: "var(--r)",
                        }}
                      >
                        {s}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div
                className="text-[12px] mt-1"
                style={{ color: "var(--mute)", lineHeight: 1.5 }}
              >
                {hint}
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-4">
              {turns.map((turn) => (
                <div key={turn.id} className="flex flex-col gap-2">
                  <div
                    className="self-end max-w-[80%] text-[13.5px] px-3 py-1.5"
                    style={{
                      background: "var(--accent-bg)",
                      color: "var(--accent-2)",
                      border: "1px solid var(--accent)",
                      borderRadius: "var(--r)",
                      borderBottomRightRadius: 4,
                    }}
                  >
                    {turn.query}
                  </div>
                  <AskResult
                    intent={turn.intent}
                    assetClass={assetClass}
                    history={turn.history}
                    cachedResp={turn.cachedResp}
                    onClose={onClose}
                    onOpenInWorkspace={(sym) => {
                      onOpenInWorkspace(sym);
                      onClose();
                    }}
                    onResolved={(resp) => handleResolved(turn.id, resp)}
                  />
                </div>
              ))}
              {/* Follow-up prompts after the last result — same idea as
                 the empty-state chips, smaller so they don't crowd the
                 reply above. */}
              <div>
                <div
                  className="text-[10.5px] uppercase mb-1.5"
                  style={{
                    color: "var(--mute)",
                    letterSpacing: "0.04em",
                  }}
                >
                  Try next
                </div>
                <div
                  className="flex gap-1.5 overflow-x-auto pb-1"
                  style={{ scrollbarWidth: "none" }}
                >
                  {followups.map((s) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => submit(s)}
                      className="cursor-pointer text-[11.5px] whitespace-nowrap transition-colors"
                      style={{
                        padding: "4px 10px",
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--text-2)",
                        borderRadius: 999,
                      }}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Convention hint — shown on first 3 opens of Ask anything; explains
           why some answers are instant + free (this bar) and others spend
           credits (ChartBot / Market summary). Dismissible. */}
        {askHint.show && (
          <button
            type="button"
            onClick={askHint.dismiss}
            className="cursor-pointer border-0 bg-transparent text-left mx-4 mt-2"
            style={{
              fontSize: 9.5,
              fontStyle: "italic",
              color: "var(--mute)",
              padding: "0 4px",
            }}
            aria-label="Dismiss tip"
            title="Dismiss"
          >
            <span style={{ color: "var(--accent)", fontStyle: "normal" }}>Teal</span>
            {" — instant local parse · free · always on. "}
            <span style={{ color: "var(--mute)" }}>(tap to hide)</span>
          </button>
        )}

        {/* Composer — pinned at the bottom of the modal. Enter submits;
           Shift+Enter inserts a newline. */}
        <div
          className="flex items-end gap-2 px-4"
          style={{
            paddingTop: 12,
            paddingBottom: isMobile ? "max(var(--safe-bottom), 14px)" : 12,
            borderTop: "1px solid var(--hairline)",
          }}
        >
          <textarea
            ref={inputRef}
            value={speech.listening && interim ? `${text}${text ? " " : ""}${interim}` : text}
            readOnly={speech.listening}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                submit(text);
              }
            }}
            placeholder={speech.listening ? "Listening…" : "Ask anything — orders, portfolio, news, charts…"}
            rows={1}
            className="flex-1 resize-none bg-transparent outline-none text-[15px]"
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              borderRadius: "var(--r)",
              color: "var(--text)",
              fontFamily: "var(--font-sans)",
              minHeight: 36,
              maxHeight: 120,
              padding: "8px 10px",
            }}
          />
          {speech.supported && (
            <MicButton
              listening={speech.listening}
              onClick={speech.toggle}
              size={isMobile ? 44 : 36}
              variant="accent"
            />
          )}
          <button
            type="button"
            onClick={() => submit(`ai: ${text}`)}
            disabled={!text.trim()}
            aria-label="Send to AI"
            title="Send straight to the AI"
            className="cursor-pointer font-semibold disabled:cursor-not-allowed"
            style={{
              background: "var(--panel-2)",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              padding: isMobile ? "0 14px" : "0 12px",
              height: isMobile ? 44 : 36,
              borderRadius: "var(--r)",
              opacity: text.trim() ? 1 : 0.5,
              fontSize: isMobile ? 14 : 13,
            }}
          >
            ✦ AI
          </button>
          <button
            type="button"
            onClick={() => submit(text)}
            disabled={!text.trim()}
            aria-label="Send"
            className="cursor-pointer border-0 font-semibold disabled:cursor-not-allowed"
            style={{
              background: "var(--accent)",
              color: "white",
              padding: isMobile ? "0 18px" : "0 14px",
              height: isMobile ? 44 : 36,
              borderRadius: "var(--r)",
              opacity: text.trim() ? 1 : 0.5,
              fontSize: isMobile ? 14 : 13,
            }}
          >
            Send
          </button>
        </div>
      </div>
    </div>
  );
}
