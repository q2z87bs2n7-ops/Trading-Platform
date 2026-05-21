import { useEffect, useState } from "react";

import { postAiAsk, type AiAskResponse } from "../../api";
import {
  useAccount,
  useBars,
  useClosePosition,
  useMarketNews,
  useMovers,
  useNews,
  useOrders,
  usePositions,
  useSnapshots,
} from "../../data/hooks";
import { useOrderTicket } from "../../hooks/useOrderTicket";
import { useSettings } from "../../hooks/useSettings";
import type { Intent } from "../../lib/cmd-intent";
import type { Mover } from "../../types";
import CmdResultCard from "./CmdResultCard";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });
const pct = (n: number) => `${n >= 0 ? "+" : ""}${(n * 100).toFixed(2)}%`;
const compact = (n: number) =>
  n.toLocaleString("en-US", {
    notation: "compact",
    maximumFractionDigits: 1,
  });

function relTime(ts: number): string {
  const diff = Math.max(0, Date.now() / 1000 - ts);
  if (diff < 60) return "now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h`;
  return `${Math.floor(diff / 86400)}d`;
}

// ── Order intent ──────────────────────────────────────────────────────────────

function OrderCard({
  side,
  qty,
  symbol,
  price,
  otype,
  onDone,
}: {
  side: "buy" | "sell";
  qty: number;
  symbol: string;
  price?: number;
  otype: "market" | "limit";
  onDone: () => void;
}) {
  const t = useOrderTicket(symbol);

  // Push the parsed intent into the form once on mount.
  useEffect(() => {
    t.setSymbol(symbol);
    t.setSide(side);
    t.setType(otype);
    t.setQty(qty);
    if (otype === "limit" && price != null) t.setLimitPrice(price);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!t.submit.isSuccess) return;
    const id = setTimeout(onDone, 900);
    return () => clearTimeout(id);
  }, [t.submit.isSuccess, onDone]);

  const tint = side === "buy" ? "var(--pos)" : "var(--neg)";
  const tintBg = side === "buy" ? "var(--pos-bg)" : "var(--neg-bg)";

  return (
    <CmdResultCard
      title={`${side === "buy" ? "Buy" : "Sell"} ${qty} ${symbol}`}
      meta={otype === "limit" ? `LIMIT ${price ?? "—"}` : "MARKET"}
    >
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase" style={{ color: "var(--mute)" }}>
            Estimated {side === "buy" ? "cost" : "proceeds"}
          </span>
          <span
            className="font-mono text-[20px] font-semibold tabular-nums"
            style={{ color: tint }}
          >
            {t.estNotional != null ? money(t.estNotional) : "—"}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span className="text-[11px] uppercase" style={{ color: "var(--mute)" }}>
            Bid / Ask
          </span>
          <span className="font-mono text-[14px] tabular-nums">
            {t.quote
              ? `${money(t.quote.bid)} · ${money(t.quote.ask)}`
              : "—"}
          </span>
        </div>
      </div>
      {t.clientError && (
        <div
          className="text-[12px] mt-3 px-2 py-1"
          style={{
            color: "var(--neg)",
            background: "var(--neg-bg)",
            borderRadius: 6,
          }}
        >
          {t.clientError}
        </div>
      )}
      {t.submit.error && (
        <div
          className="text-[12px] mt-3 px-2 py-1"
          style={{
            color: "var(--neg)",
            background: "var(--neg-bg)",
            borderRadius: 6,
          }}
        >
          {(t.submit.error as Error).message}
        </div>
      )}
      {t.submit.isSuccess && t.submit.data && (
        <div
          className="text-[12.5px] mt-3 px-3 py-2"
          style={{
            background: "var(--pos-bg)",
            color: "var(--pos)",
            borderRadius: 6,
          }}
        >
          Submitted · {t.submit.data.status} · id{" "}
          {t.submit.data.id.slice(0, 8)}
        </div>
      )}
      <button
        type="button"
        disabled={!!t.clientError || t.submit.isPending || t.submit.isSuccess}
        onClick={() => t.trySubmit({ skipConfirm: true })}
        className="w-full mt-4 text-[14px] font-semibold cursor-pointer border-0"
        style={{
          padding: "11px",
          borderRadius: "var(--r)",
          background: tint,
          color: "white",
          opacity:
            t.clientError || t.submit.isPending || t.submit.isSuccess
              ? 0.6
              : 1,
        }}
      >
        {t.submit.isPending
          ? "Submitting…"
          : `Confirm ${side === "buy" ? "Buy" : "Sell"} ${qty} ${symbol}`}
      </button>
      <div
        className="text-[11px] mt-2 text-center"
        style={{ color: "var(--mute)" }}
      >
        Paper account · no live funds at risk
      </div>
      <div className="hidden" style={{ background: tintBg }} />
    </CmdResultCard>
  );
}

// ── Close intent ──────────────────────────────────────────────────────────────

function CloseCard({ symbol, onDone }: { symbol: string; onDone: () => void }) {
  const positions = usePositions();
  const close = useClosePosition();
  const pos = (positions.data?.positions || []).find(
    (p) => p.symbol.toUpperCase() === symbol.toUpperCase(),
  );

  useEffect(() => {
    if (!close.isSuccess) return;
    const id = setTimeout(onDone, 900);
    return () => clearTimeout(id);
  }, [close.isSuccess, onDone]);

  if (positions.isPending) {
    return (
      <CmdResultCard title={`Close ${symbol}`}>
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          Loading position…
        </div>
      </CmdResultCard>
    );
  }
  if (!pos) {
    return (
      <CmdResultCard title={`Close ${symbol}`}>
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          You have no open position in {symbol}.
        </div>
      </CmdResultCard>
    );
  }

  const plUp = pos.unrealized_pl >= 0;
  return (
    <CmdResultCard
      title={`Close ${symbol}`}
      meta={`${pos.qty} shares · ${pos.side}`}
    >
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="flex flex-col">
          <span
            className="text-[11px] uppercase"
            style={{ color: "var(--mute)" }}
          >
            Market value
          </span>
          <span className="font-mono text-[16px] tabular-nums">
            {money(pos.market_value)}
          </span>
        </div>
        <div className="flex flex-col">
          <span
            className="text-[11px] uppercase"
            style={{ color: "var(--mute)" }}
          >
            Unrealized P&L
          </span>
          <span
            className="font-mono text-[16px] tabular-nums"
            style={{ color: plUp ? "var(--pos)" : "var(--neg)" }}
          >
            {plUp ? "+" : ""}
            {money(pos.unrealized_pl)} ({pct(pos.unrealized_plpc)})
          </span>
        </div>
      </div>
      {close.error && (
        <div
          className="text-[12px] mt-3 px-2 py-1"
          style={{
            color: "var(--neg)",
            background: "var(--neg-bg)",
            borderRadius: 6,
          }}
        >
          {(close.error as Error).message}
        </div>
      )}
      {close.isSuccess && (
        <div
          className="text-[12.5px] mt-3 px-3 py-2"
          style={{
            background: "var(--pos-bg)",
            color: "var(--pos)",
            borderRadius: 6,
          }}
        >
          Close order submitted.
        </div>
      )}
      <button
        type="button"
        disabled={close.isPending || close.isSuccess}
        onClick={() => close.mutate(pos.symbol)}
        className="w-full mt-4 text-[14px] font-semibold cursor-pointer border-0"
        style={{
          padding: "11px",
          borderRadius: "var(--r)",
          background: "var(--neg)",
          color: "white",
          opacity: close.isPending || close.isSuccess ? 0.6 : 1,
        }}
      >
        {close.isPending ? "Closing…" : `Close position`}
      </button>
    </CmdResultCard>
  );
}

// ── Portfolio intent ──────────────────────────────────────────────────────────

function PortfolioCard() {
  const positions = usePositions();
  const account = useAccount();
  const rows = positions.data?.positions || [];
  const total = rows.reduce((s, p) => s + p.market_value, 0);

  return (
    <CmdResultCard
      title="Portfolio"
      meta={
        account.data ? `Equity ${money(account.data.equity)}` : undefined
      }
    >
      {rows.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          No open positions.
        </div>
      ) : (
        <div className="flex flex-col">
          <div
            className="grid gap-2 text-[11px] uppercase pb-1.5"
            style={{
              gridTemplateColumns: "1fr 60px 1fr 1fr",
              color: "var(--mute)",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <span>Symbol</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Value</span>
            <span className="text-right">P&L</span>
          </div>
          {rows.map((p) => {
            const plUp = p.unrealized_pl >= 0;
            const share = total > 0 ? p.market_value / total : 0;
            return (
              <div
                key={p.symbol}
                className="grid gap-2 py-1.5 text-[13px] items-center"
                style={{
                  gridTemplateColumns: "1fr 60px 1fr 1fr",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                <span className="font-semibold">
                  {p.symbol}
                  <span
                    className="ml-2 font-mono text-[11px]"
                    style={{ color: "var(--mute)" }}
                  >
                    {(share * 100).toFixed(1)}%
                  </span>
                </span>
                <span
                  className="font-mono tabular-nums text-right"
                  style={{ color: "var(--text-2)" }}
                >
                  {p.qty}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {money(p.market_value)}
                </span>
                <span
                  className="font-mono tabular-nums text-right"
                  style={{ color: plUp ? "var(--pos)" : "var(--neg)" }}
                >
                  {plUp ? "+" : ""}
                  {money(p.unrealized_pl)}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </CmdResultCard>
  );
}

// ── Movers intent ─────────────────────────────────────────────────────────────

function MoversList({
  title,
  rows,
}: {
  title: string;
  rows: Mover[];
}) {
  return (
    <div>
      <div
        className="text-[11px] uppercase mb-2"
        style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
      >
        {title}
      </div>
      <div className="grid gap-1.5" style={{ gridTemplateColumns: "1fr 1fr" }}>
        {rows.map((m, i) => {
          const up = m.percent_change >= 0;
          return (
            <div
              key={m.symbol}
              className="flex items-center justify-between px-2 py-1 text-[13px]"
              style={{
                background: "var(--panel-2)",
                borderRadius: 6,
              }}
            >
              <span className="flex items-center gap-2 min-w-0">
                <span
                  className="font-mono text-[11px]"
                  style={{ color: "var(--mute)" }}
                >
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="font-semibold">{m.symbol}</span>
              </span>
              <span
                className="font-mono tabular-nums text-[13px]"
                style={{ color: up ? "var(--pos)" : "var(--neg)" }}
              >
                {pct(m.percent_change)}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MoversCard({ kind }: { kind: "gainers" | "losers" | "both" }) {
  const movers = useMovers(8);
  if (!movers.data) {
    return (
      <CmdResultCard title="Movers">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {movers.error ? movers.error.message : "Loading…"}
        </div>
      </CmdResultCard>
    );
  }
  return (
    <CmdResultCard title="Today's movers" meta="free IEX feed">
      <div className="flex flex-col gap-3">
        {(kind === "gainers" || kind === "both") && (
          <MoversList title="Top gainers" rows={movers.data.gainers} />
        )}
        {(kind === "losers" || kind === "both") && (
          <MoversList title="Top losers" rows={movers.data.losers} />
        )}
      </div>
    </CmdResultCard>
  );
}

// ── News intent ───────────────────────────────────────────────────────────────

function NewsRow({
  href,
  time,
  source,
  headline,
  i,
}: {
  href: string;
  time: number;
  source: string;
  headline: string;
  i: number;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noreferrer"
      className="flex gap-3 items-start no-underline"
      style={{
        padding: "8px 0",
        borderTop: i === 0 ? "none" : "1px solid var(--hairline)",
        color: "var(--text)",
      }}
    >
      <span
        className="font-mono text-[11px] min-w-[44px]"
        style={{ color: "var(--mute)" }}
      >
        {relTime(time)}
      </span>
      <div className="flex-1">
        <div
          className="text-[10.5px] uppercase font-medium"
          style={{ color: "var(--accent-2)", letterSpacing: "0.04em" }}
        >
          {source}
        </div>
        <div className="text-[13.5px] leading-snug">{headline}</div>
      </div>
    </a>
  );
}

function TickerNewsCard({ symbol }: { symbol: string }) {
  const { data, error } = useNews(symbol, 10);
  if (!data) {
    return (
      <CmdResultCard title={`News · ${symbol}`}>
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {error ? (error as Error).message : "Loading…"}
        </div>
      </CmdResultCard>
    );
  }
  const items = data.news.slice(0, 6);
  return (
    <CmdResultCard title={`News · ${symbol}`} meta={`${items.length} items`}>
      {items.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          No recent Benzinga coverage for {symbol}.
        </div>
      ) : (
        <div className="flex flex-col">
          {items.map((a, i) => (
            <NewsRow
              key={a.id}
              href={a.url}
              time={a.time}
              source={a.source}
              headline={a.headline}
              i={i}
            />
          ))}
        </div>
      )}
    </CmdResultCard>
  );
}

function MarketNewsCard() {
  const { data, error } = useMarketNews(8);
  if (!data) {
    return (
      <CmdResultCard title="Headlines">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {error ? (error as Error).message : "Loading…"}
        </div>
      </CmdResultCard>
    );
  }
  return (
    <CmdResultCard title="Market headlines" meta={`${data.articles.length} items`}>
      <div className="flex flex-col">
        {data.articles.slice(0, 6).map((a, i) => (
          <NewsRow
            key={`${a.pub_time}-${i}`}
            href={a.link}
            time={a.pub_time}
            source={a.source}
            headline={a.title}
            i={i}
          />
        ))}
      </div>
    </CmdResultCard>
  );
}

function NewsCard({ symbol }: { symbol?: string }) {
  if (symbol) return <TickerNewsCard symbol={symbol} />;
  return <MarketNewsCard />;
}

// ── Orders intent ─────────────────────────────────────────────────────────────

function OrdersCard() {
  const orders = useOrders("open", 25);
  const rows = orders.data?.orders || [];
  if (!orders.data) {
    return (
      <CmdResultCard title="Open orders">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {orders.error ? orders.error.message : "Loading…"}
        </div>
      </CmdResultCard>
    );
  }
  return (
    <CmdResultCard
      title="Open orders"
      meta={`${rows.length} working`}
    >
      {rows.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          No working orders. Recent fills appear in the blotter.
        </div>
      ) : (
        <div className="flex flex-col">
          <div
            className="grid gap-2 text-[11px] uppercase pb-1.5"
            style={{
              gridTemplateColumns: "60px 50px 1fr 1fr 1fr 1fr",
              color: "var(--mute)",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <span>Sym</span>
            <span>Side</span>
            <span className="text-right">Type</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Limit</span>
            <span className="text-right">Stop</span>
          </div>
          {rows.slice(0, 10).map((o) => {
            const sideKey = o.side.split(".").pop()!.toLowerCase();
            const buy = sideKey === "buy";
            const typeKey = o.type.split(".").pop()!.toLowerCase();
            return (
              <div
                key={o.id}
                className="grid gap-2 py-1.5 text-[13px] items-center"
                style={{
                  gridTemplateColumns: "60px 50px 1fr 1fr 1fr 1fr",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                <span className="font-semibold">{o.symbol}</span>
                <span
                  className="font-mono text-[10px] uppercase px-1.5 py-0.5 inline-block w-fit"
                  style={{
                    background: buy ? "var(--pos-bg)" : "var(--neg-bg)",
                    color: buy ? "var(--pos)" : "var(--neg)",
                    borderRadius: 4,
                  }}
                >
                  {sideKey}
                </span>
                <span
                  className="font-mono tabular-nums text-right"
                  style={{ color: "var(--text-2)" }}
                >
                  {typeKey}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {o.qty ?? "—"}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {o.limit_price ?? "—"}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {o.stop_price ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </CmdResultCard>
  );
}

// ── Chart intent ──────────────────────────────────────────────────────────────

function ChartCard({
  symbol,
  onOpenInWorkspace,
}: {
  symbol: string;
  onOpenInWorkspace: () => void;
}) {
  const snaps = useSnapshots([symbol]);
  const bars = useBars(symbol, "1Day", 60);
  const snap = snaps.data?.snapshots?.[0];

  const dayChange =
    snap?.prev_close && snap.last_price
      ? (snap.last_price - snap.prev_close) / snap.prev_close
      : 0;
  const up = dayChange >= 0;
  const stroke = up ? "var(--pos)" : "var(--neg)";

  // Mini sparkline from real bars (last 60 daily closes).
  const closes = (bars.data?.bars || []).map((b) => b.close);
  let path = "";
  if (closes.length > 1) {
    const min = Math.min(...closes);
    const max = Math.max(...closes);
    const range = max - min || 1;
    const W = 320;
    const H = 60;
    const stepX = W / (closes.length - 1);
    path = closes
      .map((c, i) => {
        const x = i * stepX;
        const y = H - ((c - min) / range) * (H - 6) - 3;
        return `${i === 0 ? "M" : "L"} ${x.toFixed(1)} ${y.toFixed(1)}`;
      })
      .join(" ");
  }

  return (
    <CmdResultCard
      title={symbol}
      meta={snap?.last_price ? money(snap.last_price) : undefined}
    >
      <div className="grid gap-3 grid-cols-1 sm:grid-cols-2">
        <div className="flex flex-col gap-1">
          <span
            className="text-[11px] uppercase"
            style={{ color: "var(--mute)" }}
          >
            Today
          </span>
          <span
            className="font-mono text-[18px] tabular-nums"
            style={{ color: stroke }}
          >
            {pct(dayChange)}
          </span>
        </div>
        <div className="flex flex-col gap-1">
          <span
            className="text-[11px] uppercase"
            style={{ color: "var(--mute)" }}
          >
            Day H / L · Vol
          </span>
          <span className="font-mono text-[13px] tabular-nums">
            {snap?.day_high ? money(snap.day_high) : "—"} /{" "}
            {snap?.day_low ? money(snap.day_low) : "—"}{" "}
            <span style={{ color: "var(--mute)" }}>
              · {snap?.day_volume ? compact(snap.day_volume) : "—"}
            </span>
          </span>
        </div>
      </div>
      {path && (
        <svg
          viewBox="0 0 320 60"
          width="100%"
          height={60}
          preserveAspectRatio="none"
          className="block mt-3"
        >
          <path d={path} fill="none" stroke={stroke} strokeWidth={1.5} />
        </svg>
      )}
      <button
        type="button"
        onClick={onOpenInWorkspace}
        className="w-full mt-3 text-[13px] font-medium cursor-pointer"
        style={{
          padding: "9px",
          background: "var(--accent-bg)",
          color: "var(--accent)",
          border: "1px solid var(--accent)",
          borderRadius: "var(--r)",
        }}
      >
        Open {symbol} in Chart workspace →
      </button>
    </CmdResultCard>
  );
}

// ── Fallback (AI off) ────────────────────────────────────────────────────────

function FallbackCard({ text }: { text: string }) {
  return (
    <CmdResultCard
      title="No match for that phrase"
      meta={text || "(empty)"}
    >
      <div className="text-[13px]" style={{ color: "var(--text-2)" }}>
        Ask anything only knows a handful of shortcuts when AI is off.
        Open the settings menu (top-right) to enable the AI fallback,
        or try one of the recognised phrases:
      </div>
      <ul
        className="mt-2 flex flex-col gap-1 text-[12.5px]"
        style={{ color: "var(--mute)" }}
      >
        <li>· "buy 50 AMD at market"</li>
        <li>· "how's NVDA?"</li>
        <li>· "show top gainers"</li>
        <li>· "news on Tesla"</li>
        <li>· "close my TSLA position"</li>
      </ul>
    </CmdResultCard>
  );
}

// ── AI ask (fallback when settings.cmdbarAiEnabled === true) ────────────────

function AiAskCard({ text }: { text: string }) {
  const [resp, setResp] = useState<AiAskResponse | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [pending, setPending] = useState(true);

  useEffect(() => {
    let cancelled = false;
    setPending(true);
    setErr(null);
    setResp(null);
    postAiAsk(text)
      .then((r) => {
        if (cancelled) return;
        setResp(r);
        setPending(false);
      })
      .catch((e: Error) => {
        if (cancelled) return;
        setErr(e.message);
        setPending(false);
      });
    return () => {
      cancelled = true;
    };
  }, [text]);

  return (
    <CmdResultCard title="✦ AI" meta={text || "(empty)"}>
      {pending && (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          Thinking…
        </div>
      )}
      {err && (
        <div
          className="text-[12.5px] px-3 py-2"
          style={{
            background: "var(--neg-bg)",
            color: "var(--neg)",
            borderRadius: 6,
          }}
        >
          {err}
        </div>
      )}
      {resp && (
        <>
          {resp.tool_calls.length > 0 && (
            <div className="flex flex-wrap gap-1.5 mb-2">
              {resp.tool_calls.map((tc, i) => (
                <span
                  key={i}
                  className="font-mono text-[10.5px] px-1.5 py-0.5"
                  style={{
                    background: tc.ok ? "var(--accent-bg)" : "var(--neg-bg)",
                    color: tc.ok ? "var(--accent)" : "var(--neg)",
                    borderRadius: 4,
                  }}
                >
                  {tc.ok ? "✓" : "✕"} {tc.name}
                </span>
              ))}
            </div>
          )}
          <div
            className="text-[13.5px] whitespace-pre-wrap leading-relaxed"
            style={{ color: "var(--text)" }}
          >
            {resp.text || "(no response)"}
          </div>
          {resp.backend_stopped === "max_iterations" && (
            <div
              className="text-[11.5px] mt-2"
              style={{ color: "var(--mute)" }}
            >
              Stopped after hitting the tool-use iteration cap.
            </div>
          )}
        </>
      )}
    </CmdResultCard>
  );
}

// Gate the fallback path on the AI setting at render time so toggling
// the setting reflects immediately in the next ⌘K query.
function FallbackOrAiCard({ text }: { text: string }) {
  const settings = useSettings();
  return settings.cmdbarAiEnabled ? (
    <AiAskCard text={text} />
  ) : (
    <FallbackCard text={text} />
  );
}

// ── Dispatch ─────────────────────────────────────────────────────────────────

export function CmdResult({
  intent,
  onClose,
  onOpenInWorkspace,
}: {
  intent: Intent;
  onClose: () => void;
  onOpenInWorkspace: (symbol: string) => void;
}) {
  switch (intent.type) {
    case "order":
      return (
        <OrderCard
          side={intent.side}
          qty={intent.qty}
          symbol={intent.symbol}
          price={intent.price}
          otype={intent.otype}
          onDone={onClose}
        />
      );
    case "close":
      return <CloseCard symbol={intent.symbol} onDone={onClose} />;
    case "portfolio":
      return <PortfolioCard />;
    case "movers":
      return <MoversCard kind={intent.kind} />;
    case "news":
      return <NewsCard symbol={intent.symbol} />;
    case "orders":
      return <OrdersCard />;
    case "chart":
      return (
        <ChartCard
          symbol={intent.symbol}
          onOpenInWorkspace={() => onOpenInWorkspace(intent.symbol)}
        />
      );
    case "fallback":
      return <FallbackOrAiCard text={intent.text} />;
  }
}

