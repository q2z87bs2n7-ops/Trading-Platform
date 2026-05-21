/**
 * useChatSession — owns turns, apiHistory, busy, send/cancel/clear,
 * and localStorage persistence. Panel components stay presentational.
 *
 * Storage shape: chartbot_session = { turns, apiHistory } (JSON).
 * Storage budget: 256KB — we drop the oldest user+assistant pair until
 * the payload fits, since screenshot tool_results blow message-count
 * caps fast.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  HISTORY_CAP,
  runAITurn,
  type APIMessage,
  type TurnEvent,
} from "../lib/ai-client";

const STORAGE_KEY = "chartbot_session";
const STORAGE_BUDGET_BYTES = 256 * 1024;

export interface RenderedTurn {
  role: "user" | "assistant";
  events: TurnEvent[];
}

interface Persisted {
  turns: RenderedTurn[];
  apiHistory: APIMessage[];
}

function load(): Persisted {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { turns: [], apiHistory: [] };
    const p = JSON.parse(raw) as { turns?: unknown[]; apiHistory?: unknown[] };
    const apiHistory = Array.isArray(p.apiHistory) ? (p.apiHistory as APIMessage[]) : [];
    // Migrate the pre-v0.31.7 { role, text, events } shape.
    const turns: RenderedTurn[] = Array.isArray(p.turns)
      ? p.turns.map((rawTurn) => {
          const t = rawTurn as { role: "user" | "assistant"; text?: string; events?: TurnEvent[] };
          const evs = Array.isArray(t.events) ? t.events : [];
          if (t.text && !evs.some((e) => e.kind === "assistant_text")) {
            const textEvent: TurnEvent = { kind: "assistant_text", text: t.text };
            return {
              role: t.role,
              events: t.role === "user" ? [textEvent] : [textEvent, ...evs],
            };
          }
          return { role: t.role, events: evs };
        })
      : [];
    return { turns, apiHistory };
  } catch {
    return { turns: [], apiHistory: [] };
  }
}

function save(turns: RenderedTurn[], apiHistory: APIMessage[]) {
  let t = turns;
  let h = apiHistory;
  for (let guard = 0; guard < 200; guard++) {
    const payload = JSON.stringify({ turns: t, apiHistory: h });
    if (payload.length <= STORAGE_BUDGET_BYTES) {
      try { localStorage.setItem(STORAGE_KEY, payload); } catch { /* quota */ }
      return;
    }
    if (t.length <= 2) {
      try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
      return;
    }
    t = t.slice(2);
    h = h.slice(2);
  }
}

interface ChartContextLite {
  symbol: string;
  resolution: string;
}

export function useChatSession(chart: ChartContextLite) {
  const [state, setState] = useState<Persisted>(load);
  const [busy, setBusy] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  // Mirror state for callbacks that need a synchronous read without
  // doing it inside a setState updater (Strict Mode runs updaters
  // twice in dev — side effects there would fire twice).
  const stateRef = useRef(state);
  stateRef.current = state;

  useEffect(() => {
    save(state.turns, state.apiHistory);
  }, [state]);

  const send = useCallback(
    async (text: string) => {
      const userText = text.trim();
      if (!userText) return;
      // Use a ref-style guard via state setter so concurrent callers
      // can't race the busy flag.
      if (abortRef.current) return;

      const ctrl = new AbortController();
      abortRef.current = ctrl;
      setBusy(true);

      // Read history & predict the new assistant turn's index from the
      // mirror ref so the setState updater stays pure (Strict Mode).
      const baseHistory = stateRef.current.apiHistory;
      const trimmedHistory =
        baseHistory.length > HISTORY_CAP
          ? baseHistory.slice(baseHistory.length - HISTORY_CAP)
          : baseHistory;
      const assistantIdx = stateRef.current.turns.length + 1;
      setState((prev) => ({
        ...prev,
        turns: [
          ...prev.turns,
          { role: "user", events: [{ kind: "assistant_text", text: userText }] },
          { role: "assistant", events: [] },
        ],
      }));

      try {
        const { newHistory } = await runAITurn(
          trimmedHistory,
          userText,
          chart,
          {
            signal: ctrl.signal,
            onEvent: (e) => {
              setState((prev) => {
                if (!prev.turns[assistantIdx]) return prev;
                const turns = prev.turns.slice();
                turns[assistantIdx] = {
                  ...turns[assistantIdx],
                  events: [...turns[assistantIdx].events, e],
                };
                return { ...prev, turns };
              });
            },
          },
        );
        setState((prev) => ({
          ...prev,
          apiHistory:
            newHistory.length > HISTORY_CAP
              ? newHistory.slice(newHistory.length - HISTORY_CAP)
              : newHistory,
        }));
      } finally {
        setBusy(false);
        abortRef.current = null;
      }
    },
    [chart],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
  }, []);

  const clear = useCallback(() => {
    setState({ turns: [], apiHistory: [] });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* noop */ }
  }, []);

  // Retry the last user message — useful when a turn ended in error.
  const retryLast = useCallback(() => {
    const turns = stateRef.current.turns;
    let userIdx = turns.length - 1;
    while (userIdx >= 0 && turns[userIdx].role !== "user") userIdx--;
    if (userIdx < 0) return;
    const ev = turns[userIdx].events.find((e) => e.kind === "assistant_text");
    if (!ev || ev.kind !== "assistant_text") return;
    const text = ev.text;
    // Drop the failed user turn (and any assistant turn after it);
    // send() will re-append both.
    setState((prev) => ({ ...prev, turns: prev.turns.slice(0, userIdx) }));
    // Defer so the state setter above commits first.
    queueMicrotask(() => void send(text));
  }, [send]);

  return useMemo(
    () => ({
      turns: state.turns,
      busy,
      send,
      cancel,
      clear,
      retryLast,
    }),
    [state.turns, busy, send, cancel, clear, retryLast],
  );
}
