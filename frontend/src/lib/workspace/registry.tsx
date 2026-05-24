import { createContext, useContext, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import Positions from "../../components/Positions";
import Orders from "../../components/Orders";
import Activities from "../../components/Activities";
import TVChartWidget from "../../components/TVChartWidget";
import OrderSheet from "../../components/trade/OrderSheet";
import { NewsCard, NewsCardSkeleton } from "../../components/discover/NewsCard";
import ErrorBanner from "../../components/ErrorBanner";
import { useMarketNews, useNews } from "../../data/hooks";
import { useLiveQuotes } from "../../data/useLiveQuotes";
import { money, fmtCryptoPrice } from "../../lib/format";

export type AssetClass = "stocks" | "crypto";

// CMC-style link channels. "main" is bound to the app's selected symbol (so the
// rest of the app — e.g. jumping to Chart mode — follows it); the colours are
// independent workspace-local groups. Widgets on the same channel share a
// symbol. A panel's channel lives in its Dockview params, so it persists with
// the saved layout.
export type Channel = "main" | "blue" | "green" | "amber";

export const CHANNELS: { id: Channel; color: string; label: string }[] = [
  { id: "main", color: "var(--mute)", label: "Main" },
  { id: "blue", color: "#3b82f6", label: "Blue" },
  { id: "green", color: "#22c55e", label: "Green" },
  { id: "amber", color: "#f59e0b", label: "Amber" },
];

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
function useChannel(props: IDockviewPanelProps): [Channel, (c: Channel) => void] {
  const [channel, setLocal] = useState<Channel>(
    () => (props.params?.channel as Channel) ?? "main",
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
}: {
  value: Channel;
  onChange: (c: Channel) => void;
}) {
  return (
    <div className="flex items-center gap-1">
      {CHANNELS.map((c) => (
        <button
          key={c.id}
          type="button"
          title={`Link: ${c.label}`}
          aria-label={`Link channel ${c.label}`}
          onClick={() => onChange(c.id)}
          className="cursor-pointer rounded-full p-0"
          style={{
            width: 11,
            height: 11,
            background: c.color,
            border: value === c.id ? "2px solid var(--text)" : "2px solid transparent",
            opacity: value === c.id ? 1 : 0.45,
          }}
        />
      ))}
    </div>
  );
}

// Thin per-widget header: optional symbol on the left, link-channel dots right.
function LinkHeader({
  symbol,
  channel,
  setChannel,
}: {
  symbol?: string;
  channel: Channel;
  setChannel: (c: Channel) => void;
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
        {symbol ?? ""}
      </span>
      <ChannelPicker value={channel} onChange={setChannel} />
    </div>
  );
}

// Fills a Dockview panel and lets the embedded surface scroll independently.
function Pane({ children, pad }: { children: React.ReactNode; pad?: boolean }) {
  return (
    <div style={{ height: "100%", overflow: "auto", padding: pad ? 12 : 0 }}>
      {children}
    </div>
  );
}

function ChartWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol } = useWorkspace();
  const [channel, setChannel] = useChannel(props);
  const symbol = getSymbol(channel);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <LinkHeader symbol={symbol} channel={channel} setChannel={setChannel} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <TVChartWidget
          symbol={symbol}
          onSymbolChange={(s) => setSymbol(channel, s)}
        />
      </div>
    </div>
  );
}

function PositionsWidget(props: IDockviewPanelProps) {
  const { setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props);
  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <LinkHeader channel={channel} setChannel={setChannel} />
      <div style={{ flex: 1, minHeight: 0 }}>
        <Pane pad>
          <Positions
            variant="strip"
            onSelect={(s) => setSymbol(channel, s)}
            assetClass={assetClass}
          />
        </Pane>
      </div>
    </div>
  );
}

function OrdersWidget(_props: IDockviewPanelProps) {
  const { assetClass } = useWorkspace();
  return (
    <Pane pad>
      <Orders assetClass={assetClass} />
    </Pane>
  );
}

function ActivityWidget(_props: IDockviewPanelProps) {
  return (
    <Pane pad>
      <Activities bare />
    </Pane>
  );
}

function NewsWidget(_props: IDockviewPanelProps) {
  const { assetClass } = useWorkspace();
  const isCrypto = assetClass === "crypto";
  const stock = useMarketNews(12, !isCrypto);
  const crypto = useNews("BTC", 12, isCrypto);

  if (isCrypto) {
    return (
      <Pane pad>
        {crypto.error && <ErrorBanner message={crypto.error.message} />}
        {!crypto.data && !crypto.error && <NewsCardSkeleton />}
        {crypto.data && (
          <NewsCard
            articles={crypto.data.news.map((n) => ({
              title: n.headline,
              link: n.url,
              summary: n.summary,
              source: n.source,
              pub_time: n.time,
            }))}
          />
        )}
      </Pane>
    );
  }
  return (
    <Pane pad>
      {stock.error && <ErrorBanner message={stock.error.message} />}
      {!stock.data && !stock.error && <NewsCardSkeleton />}
      {stock.data && <NewsCard articles={stock.data.articles} />}
    </Pane>
  );
}

// Compact order-entry panel: linked symbol + live quote + Buy/Sell. Reuses the
// full OrderSheet ticket (and useOrderTicket inside it) rather than rebuilding
// the form — same pattern as the floating TradeBar.
function TradeWidget(props: IDockviewPanelProps) {
  const { getSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props);
  const sym = getSymbol(channel).toUpperCase();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const { quotes } = useLiveQuotes([sym]);
  const quote = quotes[sym];
  const fmt = assetClass === "crypto" ? fmtCryptoPrice : money;

  function openSheet(s: "buy" | "sell") {
    setSide(s);
    setOpen(true);
  }

  return (
    <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
      <LinkHeader channel={channel} setChannel={setChannel} />
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
          <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
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
      </Pane>
      <OrderSheet
        open={open}
        symbol={sym}
        defaultSide={side}
        onClose={() => setOpen(false)}
      />
    </div>
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
