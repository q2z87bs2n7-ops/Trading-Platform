import { createContext, useContext, useRef, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import { useContainerNarrow } from "../../hooks/useContainerNarrow";
import Positions from "../../components/Positions";
import Orders from "../../components/Orders";
import Activities from "../../components/Activities";
import TVChartWidget from "../../components/TVChartWidget";
import PriceChart from "../../components/PriceChart";
import OrderTicketInline from "../../components/trade/OrderTicketInline";
import AccountPanel from "../../components/AccountPanel";
import { AssetSearch } from "../../components/AssetSearch";
import { NewsCard, NewsCardSkeleton } from "../../components/discover/NewsCard";
import ErrorBanner from "../../components/ErrorBanner";
import { useMarketNews, useNews } from "../../data/hooks";

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

// Thin per-widget header: a left label that doubles as a click-to-search symbol
// picker (writes to the widget's channel), plus link-channel dots on the right.
function LinkHeader({
  label,
  channel,
  setChannel,
  includeNone,
  assetClass,
  onPickSymbol,
}: {
  label: string;
  channel: Channel;
  setChannel: (c: Channel) => void;
  includeNone: boolean;
  assetClass?: AssetClass;
  onPickSymbol?: (sym: string) => void;
}) {
  const [searching, setSearching] = useState(false);
  const canPick = channel !== "none" && !!onPickSymbol;
  return (
    <div
      className="flex items-center justify-between shrink-0 gap-2"
      style={{ padding: "6px 10px", borderBottom: "1px solid var(--hairline)" }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setSearching(false);
      }}
    >
      {searching && canPick ? (
        <AssetSearch
          assetClass={assetClass === "crypto" ? "crypto" : "us_equity"}
          align="left"
          autoFocus
          fluid
          onChoose={(s) => {
            onPickSymbol?.(s);
            setSearching(false);
          }}
        />
      ) : canPick ? (
        <button
          type="button"
          onClick={() => setSearching(true)}
          title="Change instrument"
          className="text-[12px] font-semibold tabular-nums cursor-pointer bg-transparent border-0 p-0 text-left"
          style={{ color: "var(--text-2)" }}
        >
          {label || "—"} ▾
        </button>
      ) : (
        <span
          className="text-[12px] font-semibold tabular-nums"
          style={{ color: "var(--text-2)" }}
        >
          {label}
        </span>
      )}
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
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
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
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
        />
      }
    >
      <TVChartWidget symbol={symbol} onSymbolChange={(s) => setSymbol(channel, s)} />
    </WidgetShell>
  );
}

// Lightweight (lightweight-charts) alternative to the heavy TV chart — a faster,
// no-iframe option for small panels / many-up grids. Symbol-linked like the TV
// chart (no "none").
function MiniChartWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
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
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
        />
      }
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <PriceChart symbol={symbol} responsive />
      </div>
    </WidgetShell>
  );
}

function PositionsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const symbol = channel === "none" ? undefined : getSymbol(channel);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, 480);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol ?? "Account"}
          channel={channel}
          setChannel={setChannel}
          includeNone
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          <Positions
            variant="strip"
            symbol={symbol}
            dense={dense}
            onSelect={(s) => setSymbol(channel === "none" ? "main" : channel, s)}
            assetClass={assetClass}
          />
        </Pane>
      </div>
    </WidgetShell>
  );
}

function OrdersWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const symbol = channel === "none" ? undefined : getSymbol(channel);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, 480);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol ?? "Account"}
          channel={channel}
          setChannel={setChannel}
          includeNone
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          <Orders assetClass={assetClass} symbol={symbol} dense={dense} />
        </Pane>
      </div>
    </WidgetShell>
  );
}

function ActivityWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const symbol = channel === "none" ? undefined : getSymbol(channel);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, 480);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol ?? "Account"}
          channel={channel}
          setChannel={setChannel}
          includeNone
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          <Activities bare symbol={symbol} dense={dense} />
        </Pane>
      </div>
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
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
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
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
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

// Whole-account overview widget — no symbol/channel, just account figures.
function AccountWidget(_props: IDockviewPanelProps) {
  const { assetClass } = useWorkspace();
  return (
    <WidgetShell
      header={
        <div
          className="flex items-center shrink-0"
          style={{ padding: "6px 10px", borderBottom: "1px solid var(--hairline)" }}
        >
          <span
            className="text-[12px] font-semibold"
            style={{ color: "var(--text-2)" }}
          >
            Account
          </span>
        </div>
      }
    >
      <Pane pad>
        <AccountPanel assetClass={assetClass} />
      </Pane>
    </WidgetShell>
  );
}

// Order-entry panel: a full inline order ticket. Always symbol-linked (no
// account/"none" channel — account info lives in the Account widget). Reuses
// useOrderTicket via OrderTicketInline.
function TradeWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const sym = getSymbol(channel).toUpperCase();

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={sym}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
        />
      }
    >
      <Pane pad>
        <OrderTicketInline symbol={sym} />
      </Pane>
    </WidgetShell>
  );
}

// id → React component, consumed by DockviewReact's `components` map.
export const WIDGET_COMPONENTS: Record<
  string,
  React.FunctionComponent<IDockviewPanelProps>
> = {
  chart: ChartWidget,
  minichart: MiniChartWidget,
  trade: TradeWidget,
  account: AccountWidget,
  positions: PositionsWidget,
  orders: OrdersWidget,
  activity: ActivityWidget,
  news: NewsWidget,
};

// Drives the "add widget" menu and panel titles.
export const WIDGET_CATALOG: { id: string; title: string }[] = [
  { id: "chart", title: "Chart" },
  { id: "minichart", title: "Mini chart" },
  { id: "trade", title: "Trade" },
  { id: "account", title: "Account" },
  { id: "positions", title: "Positions" },
  { id: "orders", title: "Orders" },
  { id: "activity", title: "Activity" },
  { id: "news", title: "News" },
];

export const WIDGET_TITLES: Record<string, string> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.id, w.title]),
);
