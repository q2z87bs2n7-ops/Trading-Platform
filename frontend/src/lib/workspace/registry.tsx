import { createContext, useContext, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import Positions from "../../components/Positions";
import Orders from "../../components/Orders";
import Activities from "../../components/Activities";
import TVChartWidget from "../../components/TVChartWidget";
import OrderSheet from "../../components/trade/OrderSheet";
import { NewsCard, NewsCardSkeleton } from "../../components/discover/NewsCard";
import ErrorBanner from "../../components/ErrorBanner";
import { useAccount, useMarketNews, useNews } from "../../data/hooks";
import { useLiveQuotes } from "../../data/useLiveQuotes";
import { money, fmtCryptoPrice } from "../../lib/format";

export type AssetClass = "stocks" | "crypto";

// CMC-style link channels. "none" unlinks a widget so it shows whole-account
// (unfiltered) info. "main" is bound to the app's selected symbol (so the rest
// of the app — Chart mode etc. — follows it); the colours are independent
// symbol groups. Widgets on the same symbol channel share a symbol and filter
// to that instrument. A panel's channel lives in its Dockview params, so it
// persists with the saved layout.
export type Channel = "none" | "main" | "blue" | "green" | "amber";

const CHANNEL_META: Record<Channel, { color: string; label: string }> = {
  none: { color: "transparent", label: "None (account)" },
  main: { color: "var(--mute)", label: "Main" },
  blue: { color: "#3b82f6", label: "Blue" },
  green: { color: "#22c55e", label: "Green" },
  amber: { color: "#f59e0b", label: "Amber" },
};
const SYMBOL_CHANNELS: Channel[] = ["main", "blue", "green", "amber"];

// Live, non-serialized state shared by the canvas. Channel→symbol flows through
// here (runtime); only the per-panel channel *assignment* is persisted, in the
// panel's Dockview params.
interface WorkspaceCtx {
  assetClass: AssetClass;
  getSymbol: (channel: Channel) => string;
  setSymbol: (channel: Channel, sym: string) => void;
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null);
export const WorkspaceProvider = WorkspaceContext.Provider;

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}

// Per-panel link channel, persisted in the panel's Dockview params.
function useChannel(
  props: IDockviewPanelProps,
  fallback: Channel,
): [Channel, (c: Channel) => void] {
  const [channel, setLocal] = useState<Channel>(
    () => (props.params?.channel as Channel) ?? fallback,
  );
  const set = (c: Channel) => {
    setLocal(c);
    props.api.updateParameters({ ...props.params, channel: c });
  };
  return [channel, set];
}

function ChannelPicker({
  value,
  onChange,
  includeNone,
}: {
  value: Channel;
  onChange: (c: Channel) => void;
  includeNone: boolean;
}) {
  const opts: Channel[] = includeNone
    ? ["none", ...SYMBOL_CHANNELS]
    : SYMBOL_CHANNELS;
  return (
    <div className="flex items-center gap-1">
      {opts.map((id) => {
        const meta = CHANNEL_META[id];
        const active = value === id;
        const isNone = id === "none";
        return (
          <button
            key={id}
            type="button"
            title={`Link: ${meta.label}`}
            aria-label={`Link channel ${meta.label}`}
            onClick={() => onChange(id)}
            className="cursor-pointer rounded-full p-0"
            style={{
              width: 11,
              height: 11,
              background: isNone ? "transparent" : meta.color,
              border: isNone
                ? `2px solid ${active ? "var(--text)" : "var(--border)"}`
                : `2px solid ${active ? "var(--text)" : "transparent"}`,
              opacity: active ? 1 : 0.45,
            }}
          />
        );
      })}
    </div>
  );
}

// Thin per-widget header: a left label (symbol or "Account") + channel dots.
function LinkHeader({
  label,
  channel,
  setChannel,
  includeNone,
}: {
  label: string;
  channel: Channel;
  setChannel: (c: Channel) => void;
  includeNone: boolean;
}) {
  return (
    <div
      className="flex items-center justify-between shrink-0"
      style={{ padding: "6px 10px", borderBottom: "1px solid var(--hairline)" }}
    >
      <span
        className="text-[12px] font-semibold tabular-nums"
        style={{ color: "var(--text-2)" }}
      >
        {label}
      </span>
      <ChannelPicker value={channel} onChange={setChannel} includeNone={includeNone} />
    </div>
  );
}

// Fills the panel below a header and lets the embedded surface scroll.
function Pane({ children, pad }: { children: React.ReactNode; pad?: boolean }) {
  return (
    <div style={{ height: "100%", overflow: "auto", padding: pad ? 12 : 0 }}>
      {children}
    </div>
  );
}

// Wraps a header + scrollable body in a full-height column.
function WidgetShell({
  header,
  children,
}: {
  header: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      {header}
      <div style={{ flex: 1, minHeight: 0 }}>{children}</div>
    </div>
  );
}

function ChartWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
        />
      }
    >
      <TVChartWidget symbol={symbol} onSymbolChange={(s) => setSymbol(channel, s)} />
    </WidgetShell>
  );
}

function PositionsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const symbol = channel === "none" ? undefined : getSymbol(channel);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol ?? "Account"}
          channel={channel}
          setChannel={setChannel}
          includeNone
        />
      }
    >
      <Pane pad>
        <Positions
          variant="strip"
          symbol={symbol}
          onSelect={(s) => setSymbol(channel === "none" ? "main" : channel, s)}
          assetClass={assetClass}
        />
      </Pane>
    </WidgetShell>
  );
}

function OrdersWidget(props: IDockviewPanelProps) {
  const { getSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const symbol = channel === "none" ? undefined : getSymbol(channel);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol ?? "Account"}
          channel={channel}
          setChannel={setChannel}
          includeNone
        />
      }
    >
      <Pane pad>
        <Orders assetClass={assetClass} symbol={symbol} />
      </Pane>
    </WidgetShell>
  );
}

function ActivityWidget(props: IDockviewPanelProps) {
  const { getSymbol } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const symbol = channel === "none" ? undefined : getSymbol(channel);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol ?? "Account"}
          channel={channel}
          setChannel={setChannel}
          includeNone
        />
      }
    >
      <Pane pad>
        <Activities bare symbol={symbol} />
      </Pane>
    </WidgetShell>
  );
}

// "" base ticker means stocks-account news → fall back to the market feed.
function newsTicker(channel: Channel, symbol: string, isCrypto: boolean): string {
  if (channel === "none") return isCrypto ? "BTC" : "";
  const s = symbol.toUpperCase();
  return s.includes("/") ? s.split("/")[0] : s;
}

function NewsWidget(props: IDockviewPanelProps) {
  const { getSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const isCrypto = assetClass === "crypto";
  const symbol = channel === "none" ? "" : getSymbol(channel);
  const ticker = newsTicker(channel, symbol, isCrypto);
  const useMarket = channel === "none" && !isCrypto;

  const market = useMarketNews(12, useMarket);
  const perSymbol = useNews(ticker, 12, ticker.length > 0);

  const label = channel === "none" ? (isCrypto ? "Crypto" : "Market") : symbol;

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={label}
          channel={channel}
          setChannel={setChannel}
          includeNone
        />
      }
    >
      <Pane pad>
        {useMarket ? (
          <>
            {market.error && <ErrorBanner message={market.error.message} />}
            {!market.data && !market.error && <NewsCardSkeleton />}
            {market.data && <NewsCard articles={market.data.articles} />}
          </>
        ) : (
          <>
            {perSymbol.error && <ErrorBanner message={perSymbol.error.message} />}
            {!perSymbol.data && !perSymbol.error && <NewsCardSkeleton />}
            {perSymbol.data && (
              <NewsCard
                articles={perSymbol.data.news.map((n) => ({
                  title: n.headline,
                  link: n.url,
                  summary: n.summary,
                  source: n.source,
                  pub_time: n.time,
                }))}
              />
            )}
          </>
        )}
      </Pane>
    </WidgetShell>
  );
}

function AccountRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between py-1.5 text-[13px]">
      <span style={{ color: "var(--mute)" }}>{k}</span>
      <span className="font-mono tabular-nums">{v}</span>
    </div>
  );
}

function AccountSummary({ assetClass }: { assetClass: AssetClass }) {
  const { data: acct } = useAccount();
  const bp =
    (assetClass === "crypto"
      ? acct?.non_marginable_buying_power
      : acct?.buying_power) ?? 0;
  return (
    <Pane pad>
      <AccountRow k="Equity" v={money(acct?.equity ?? 0)} />
      <AccountRow k="Buying power" v={money(bp)} />
      <AccountRow k="Cash" v={money(acct?.cash ?? 0)} />
      <span className="text-[11px] block mt-2" style={{ color: "var(--mute)" }}>
        Link a colour channel to trade an instrument.
      </span>
    </Pane>
  );
}

// Compact order-entry panel: linked symbol + live quote + Buy/Sell. Reuses the
// full OrderSheet ticket (and useOrderTicket inside it) rather than rebuilding
// the form. On the "none" channel it shows account info instead.
function TradeWidget(props: IDockviewPanelProps) {
  const { getSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const sym = channel === "none" ? "" : getSymbol(channel).toUpperCase();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const { quotes } = useLiveQuotes(sym ? [sym] : []);
  const quote = quotes[sym];
  const fmt = assetClass === "crypto" ? fmtCryptoPrice : money;

  function openSheet(s: "buy" | "sell") {
    setSide(s);
    setOpen(true);
  }

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={channel === "none" ? "Account" : sym}
          channel={channel}
          setChannel={setChannel}
          includeNone
        />
      }
    >
      {channel === "none" ? (
        <AccountSummary assetClass={assetClass} />
      ) : (
        <Pane pad>
          <div className="flex flex-col gap-3">
            <div className="flex items-baseline justify-between">
              <span className="text-[15px] font-semibold">{sym}</span>
              {quote && (
                <span
                  className="font-mono text-[13px] tabular-nums"
                  style={{ color: "var(--text-2)" }}
                >
                  {fmt(quote.mid)}
                </span>
              )}
            </div>
            <div
              className="grid gap-2"
              style={{ gridTemplateColumns: "1fr 1fr" }}
            >
              {(["buy", "sell"] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => openSheet(s)}
                  className="text-[14px] font-semibold cursor-pointer border-0 capitalize"
                  style={{
                    padding: "12px 16px",
                    borderRadius: "var(--r)",
                    background: s === "buy" ? "var(--pos)" : "var(--neg)",
                    color: "white",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
            <span className="text-[11px]" style={{ color: "var(--mute)" }}>
              Opens the full order ticket.
            </span>
          </div>
          <OrderSheet
            open={open}
            symbol={sym}
            defaultSide={side}
            onClose={() => setOpen(false)}
          />
        </Pane>
      )}
    </WidgetShell>
  );
}

// id → React component, consumed by DockviewReact's `components` map.
export const WIDGET_COMPONENTS: Record<
  string,
  React.FunctionComponent<IDockviewPanelProps>
> = {
  chart: ChartWidget,
  trade: TradeWidget,
  positions: PositionsWidget,
  orders: OrdersWidget,
  activity: ActivityWidget,
  news: NewsWidget,
};

// Drives the "add widget" menu and panel titles.
export const WIDGET_CATALOG: { id: string; title: string }[] = [
  { id: "chart", title: "Chart" },
  { id: "trade", title: "Trade" },
  { id: "positions", title: "Positions" },
  { id: "orders", title: "Orders" },
  { id: "activity", title: "Activity" },
  { id: "news", title: "News" },
];

export const WIDGET_TITLES: Record<string, string> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.id, w.title]),
);
