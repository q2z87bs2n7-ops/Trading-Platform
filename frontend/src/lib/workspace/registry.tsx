import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { IDockviewPanelHeaderProps, IDockviewPanelProps } from "dockview-react";
import { useContainerNarrow } from "../../hooks/useContainerNarrow";
import Positions from "../../components/Positions";
import Orders from "../../components/Orders";
import Activities from "../../components/Activities";
import TVChartWidget from "../../components/TVChartWidget";
import PriceChart from "../../components/PriceChart";
import OrderTicketInline from "../../components/trade/OrderTicketInline";
import AccountPanel from "../../components/AccountPanel";
import AssetProfile from "../../components/AssetProfile";
import Fundamentals from "../../components/Fundamentals";
import Watchlist from "../../components/Watchlist";
import { AssetSearch } from "../../components/AssetSearch";
import { NewsCard, NewsCardSkeleton } from "../../components/discover/NewsCard";
import {
  EarningsCard,
  EarningsCardSkeleton,
} from "../../components/discover/EarningsCard";
import ErrorBanner from "../../components/ErrorBanner";
import { isCryptoSymbol } from "../asset-class";
import {
  useEarningsCalendar,
  useMarketNews,
  useNews,
  useSymbolEarnings,
} from "../../data/hooks";

export type AssetClass = "stocks" | "crypto";

// CMC-style link channels. "none" unlinks a widget so it shows whole-account
// (unfiltered) info. "main" is bound to the app's selected symbol (so the rest
// of the app — Chart mode etc. — follows it); the colours are independent
// symbol groups. Widgets on the same symbol channel share a symbol and filter
// to that instrument. A panel's channel lives in its Dockview params, so it
// persists with the saved layout.
export type Channel = "none" | "main" | "blue" | "green" | "amber";

export const CHANNEL_META: Record<Channel, { color: string; label: string }> = {
  none: { color: "transparent", label: "None (account)" },
  main: { color: "var(--mute)", label: "Main" },
  blue: { color: "#3b82f6", label: "Blue" },
  green: { color: "#22c55e", label: "Green" },
  amber: { color: "#f59e0b", label: "Amber" },
};
export const SYMBOL_CHANNELS: Channel[] = ["main", "blue", "green", "amber"];

// Live, non-serialized state shared by the canvas. Channel→symbol flows through
// here (runtime); only the per-panel channel *assignment* is persisted, in the
// panel's Dockview params. registerPanelChannel/unregisterPanelChannel let
// useChannel push its current channel up so Workspace can count usage per
// channel for the toolbar Channels strip (Dockview doesn't emit a
// params-changed event).
interface WorkspaceCtx {
  assetClass: AssetClass;
  getSymbol: (channel: Channel) => string;
  setSymbol: (channel: Channel, sym: string) => void;
  registerPanelChannel: (panelId: string, channel: Channel) => void;
  unregisterPanelChannel: (panelId: string) => void;
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null);
export const WorkspaceProvider = WorkspaceContext.Provider;

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}

// Per-panel link channel, persisted in the panel's Dockview params. Also
// reports the current channel up to the Workspace context so the toolbar
// Channels strip can count widgets per channel.
function useChannel(
  props: IDockviewPanelProps,
  fallback: Channel,
): [Channel, (c: Channel) => void] {
  const { registerPanelChannel, unregisterPanelChannel } = useWorkspace();
  const [channel, setLocal] = useState<Channel>(
    () => (props.params?.channel as Channel) ?? fallback,
  );
  const panelId = props.api.id;
  useEffect(() => {
    registerPanelChannel(panelId, channel);
  }, [panelId, channel, registerPanelChannel]);
  useEffect(
    () => () => unregisterPanelChannel(panelId),
    [panelId, unregisterPanelChannel],
  );
  // Seed Dockview params with the resolved channel on mount so TabWithChannel
  // (which reads params.channel) shows the right colour dot from the first
  // render. set() handles subsequent updates.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (props.params?.channel === undefined) {
      props.api.updateParameters({ ...(props.params ?? {}), channel });
    }
  }, []);
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

// Per-widget header v2: a 2px channel-coloured accent bar across the top, a
// primary mono symbol label that doubles as a click-to-search picker, an
// optional muted `kind` label (e.g. "AAPL · Chart"), and link-channel dots on
// the right. The accent bar lives inside the existing top padding so the
// header's total height is unchanged.
function LinkHeader({
  label,
  channel,
  setChannel,
  includeNone,
  assetClass,
  onPickSymbol,
  lockedChannel,
  kind,
  pickOnNone,
}: {
  label: string;
  channel: Channel;
  setChannel: (c: Channel) => void;
  includeNone: boolean;
  assetClass?: AssetClass;
  onPickSymbol?: (sym: string) => void;
  lockedChannel?: boolean;
  kind?: string;
  // Charts on the `none` channel are standalone (own their symbol), so they
  // still allow the symbol picker; data widgets on `none` are account-wide.
  pickOnNone?: boolean;
}) {
  const [searching, setSearching] = useState(false);
  const canPick = (channel !== "none" || !!pickOnNone) && !!onPickSymbol;
  const accent = channel === "none" ? "transparent" : CHANNEL_META[channel].color;
  return (
    <div
      className="flex items-center justify-between shrink-0 gap-2"
      style={{
        padding: "6px 10px 5px",
        borderBottom: "1px solid var(--hairline)",
        position: "relative",
      }}
      onKeyDown={(e) => {
        if (e.key === "Escape") setSearching(false);
      }}
    >
      <div
        aria-hidden
        style={{
          position: "absolute",
          top: 0,
          left: 0,
          right: 0,
          height: 2,
          background: accent,
        }}
      />
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
      ) : (
        <div className="flex items-baseline gap-1.5 min-w-0">
          {canPick ? (
            <button
              type="button"
              onClick={() => setSearching(true)}
              title="Change instrument"
              className="text-[12px] font-semibold font-mono tabular-nums cursor-pointer bg-transparent border-0 p-0 text-left rounded-card"
              style={{
                color: "var(--text)",
                padding: "2px 6px",
                marginLeft: -6,
                letterSpacing: "-0.01em",
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--panel-2)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
              }}
            >
              {label || "—"}{" "}
              <span style={{ color: "var(--mute)", fontSize: 9 }}>▾</span>
            </button>
          ) : (
            <span
              className="text-[12px] font-semibold font-mono tabular-nums"
              style={{ color: "var(--text)" }}
            >
              {label}
            </span>
          )}
          {kind && (
            <span
              className="text-[11px] font-medium truncate"
              style={{ color: "var(--mute)" }}
            >
              · {kind}
            </span>
          )}
        </div>
      )}
      {!lockedChannel && (
        <ChannelPicker value={channel} onChange={setChannel} includeNone={includeNone} />
      )}
    </div>
  );
}

// Custom Dockview tab — prepends a 6px channel dot to the panel title so tabs
// in a stacked group are scannable. Reads the panel's channel from
// params (live-updated by useChannel via updateParameters).
export function TabWithChannel(props: IDockviewPanelHeaderProps) {
  const channel = ((props.params?.channel as Channel) ?? "main") as Channel;
  const meta = CHANNEL_META[channel];
  const isNone = channel === "none";
  const isMain = channel === "main";
  return (
    <div className="dv-default-tab">
      <span
        aria-hidden
        style={{
          width: 7,
          height: 7,
          marginRight: 7,
          borderRadius: "50%",
          background: isNone ? "transparent" : meta.color,
          border: isMain
            ? "1.5px solid var(--mute)"
            : isNone
              ? "1.5px solid var(--border)"
              : "0",
          boxSizing: "border-box",
          display: "inline-block",
          flexShrink: 0,
        }}
      />
      <span className="dv-default-tab-content">{props.api.title}</span>
      <span
        className="dv-default-tab-action"
        onClick={(e) => {
          e.stopPropagation();
          props.api.close();
        }}
      />
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

// Standalone-chart symbol. On a colour/`main` channel a chart follows that
// channel's shared symbol; on `none` it's standalone and owns its symbol,
// persisted in the panel's `params.symbol` (so N>4 charts can each show a
// distinct instrument without burning a colour channel). A local mirror of
// the own-symbol guarantees a re-render on pick; Dockview merges params so
// writing just `{ symbol }` leaves the channel intact.
function useChartSymbol(
  props: IDockviewPanelProps,
  channel: Channel,
  setChannel: (c: Channel) => void,
): { symbol: string; setSymbol: (s: string) => void; setChannel: (c: Channel) => void } {
  const { getSymbol, setSymbol: setChannelSymbol } = useWorkspace();
  const [ownSymbol, setOwnSymbol] = useState<string>(
    () => (props.params?.symbol as string) ?? "",
  );
  const symbol =
    channel === "none" ? ownSymbol || getSymbol("main") : getSymbol(channel);

  const setSymbol = (s: string) => {
    if (channel === "none") {
      setOwnSymbol(s);
      props.api.updateParameters({ symbol: s });
    } else {
      setChannelSymbol(channel, s);
    }
  };

  const setChannelTo = (c: Channel) => {
    // Going standalone: seed the panel's own symbol with what's shown so it
    // doesn't snap to the main symbol.
    if (c === "none" && channel !== "none") {
      setOwnSymbol(symbol);
      props.api.updateParameters({ symbol });
    }
    setChannel(c);
  };

  return { symbol, setSymbol, setChannel: setChannelTo };
}

function ChartWidget(props: IDockviewPanelProps) {
  const { assetClass } = useWorkspace();
  const [channel, rawSetChannel] = useChannel(props, "main");
  const { symbol, setSymbol, setChannel } = useChartSymbol(props, channel, rawSetChannel);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol}
          channel={channel}
          setChannel={setChannel}
          includeNone
          pickOnNone
          assetClass={assetClass}
          onPickSymbol={setSymbol}
          kind="Chart"
        />
      }
    >
      <TVChartWidget symbol={symbol} onSymbolChange={setSymbol} />
    </WidgetShell>
  );
}

// Lightweight (lightweight-charts) alternative to the heavy TV chart — a faster,
// no-iframe option for small panels / many-up grids. Like the TV chart it can be
// channel-linked or standalone (`none`, owns its symbol).
function MiniChartWidget(props: IDockviewPanelProps) {
  const { assetClass } = useWorkspace();
  const [channel, rawSetChannel] = useChannel(props, "main");
  const { symbol, setSymbol, setChannel } = useChartSymbol(props, channel, rawSetChannel);
  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol}
          channel={channel}
          setChannel={setChannel}
          includeNone
          pickOnNone
          assetClass={assetClass}
          onPickSymbol={setSymbol}
          kind="Mini chart"
        />
      }
    >
      <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
        <PriceChart symbol={symbol} responsive />
      </div>
    </WidgetShell>
  );
}

// Table→stacked-card flip widths, tuned per widget by column count. Orders has
// the widest table (11 cols) so it flips earliest; Activities is the narrowest.
const POSITIONS_DENSE_W = 480;
const ORDERS_DENSE_W = 560;
const ACTIVITY_DENSE_W = 360;
const PROFILE_DENSE_W = 340;
const EARNINGS_DENSE_W = 420;

function PositionsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const symbol = channel === "none" ? undefined : getSymbol(channel);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, POSITIONS_DENSE_W);
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
          kind="Positions"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          <Positions
            variant="strip"
            symbol={symbol}
            dense={dense}
            bare
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
  const dense = useContainerNarrow(ref, ORDERS_DENSE_W);
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
          kind="Orders"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          <Orders assetClass={assetClass} symbol={symbol} dense={dense} bare />
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
  const dense = useContainerNarrow(ref, ACTIVITY_DENSE_W);
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
          kind="Activity"
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
          kind="News"
        />
      }
    >
      <Pane pad>
        {useMarket ? (
          <>
            {market.error && <ErrorBanner message={market.error.message} />}
            {!market.data && !market.error && <NewsCardSkeleton bare />}
            {market.data && <NewsCard articles={market.data.articles} bare />}
          </>
        ) : (
          <>
            {perSymbol.error && <ErrorBanner message={perSymbol.error.message} />}
            {!perSymbol.data && !perSymbol.error && <NewsCardSkeleton bare />}
            {perSymbol.data && (
              <NewsCard
                bare
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

// Silo watchlist. Like Positions, a click writes the picked symbol to the
// widget's channel (none → main) so linked widgets follow; the list itself
// always shows the whole silo watchlist.
function WatchlistWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const target = channel === "none" ? "main" : channel;
  return (
    <WidgetShell
      header={
        <LinkHeader
          label="Watchlist"
          channel={channel}
          setChannel={setChannel}
          includeNone
        />
      }
    >
      <Pane pad>
        <Watchlist
          assetClass={assetClass}
          selected={getSymbol(target)}
          onSelect={(s) => setSymbol(target, s)}
        />
      </Pane>
    </WidgetShell>
  );
}

// Whole-account overview widget — no symbol/channel, just account figures.
// Routed through LinkHeader (lockedChannel) for visual rhythm with the rest.
function AccountWidget(_props: IDockviewPanelProps) {
  const { assetClass } = useWorkspace();
  return (
    <WidgetShell
      header={
        <LinkHeader
          label="Account"
          channel="none"
          setChannel={() => {}}
          includeNone
          lockedChannel
          kind="Account"
        />
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
          kind="Trade"
        />
      }
    >
      <Pane pad>
        <OrderTicketInline symbol={sym} />
      </Pane>
    </WidgetShell>
  );
}

// Catalogue enrichment for the linked symbol (fundamentals for stocks,
// tokenomics + price extremes for crypto). Always symbol-linked (no account
// view), so it mirrors the Trade widget: default "main", no "none" option.
function ProfileWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, PROFILE_DENSE_W);
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
          kind="Profile"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          <AssetProfile symbol={symbol} assetClass={assetClass} dense={dense} />
        </Pane>
      </div>
    </WidgetShell>
  );
}

// Fundamentals widget: annual statement figures (revenue/net-income trend,
// valuation, margins, growth, dividend) for the linked symbol. Stocks-only and
// always symbol-linked, so it mirrors Profile: default "main", no "none".
function FundamentalsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, PROFILE_DENSE_W);
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
          kind="Fundamentals"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          <Fundamentals symbol={symbol} assetClass={assetClass} dense={dense} />
        </Pane>
      </div>
    </WidgetShell>
  );
}

// Earnings widget: symbol-linked (a colour channel shows that ticker's report
// history) or whole-market on the `none` channel (the curated upcoming calendar,
// mirroring NewsWidget's market mode).
function EarningsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const isMarket = channel === "none";
  const symbol = isMarket ? "" : getSymbol(channel).toUpperCase();
  // Crypto has no earnings — skip the fetch and show a clear notice instead of
  // the backend's bare "not found".
  const isCrypto = !isMarket && isCryptoSymbol(symbol);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, EARNINGS_DENSE_W);

  const market = useEarningsCalendar(isMarket);
  const perSymbol = useSymbolEarnings(symbol, !isMarket && !isCrypto);
  const active = isMarket ? market : perSymbol;

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={isMarket ? "Market" : symbol}
          channel={channel}
          setChannel={setChannel}
          includeNone
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
          kind="Earnings"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          {isCrypto ? (
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              Crypto assets don’t report earnings. Link this widget to a stock,
              or switch it to Market.
            </p>
          ) : (
            <>
              {active.error && <ErrorBanner message={active.error.message} />}
              {!active.data && !active.error && <EarningsCardSkeleton bare />}
              {active.data && (
                <EarningsCard
                  rows={active.data.earnings}
                  bare
                  dense={dense}
                  showYear={!isMarket}
                  onSelect={(s) => setSymbol(channel, s)}
                />
              )}
            </>
          )}
        </Pane>
      </div>
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
  watchlist: WatchlistWidget,
  trade: TradeWidget,
  account: AccountWidget,
  positions: PositionsWidget,
  orders: OrdersWidget,
  activity: ActivityWidget,
  news: NewsWidget,
  profile: ProfileWidget,
  fundamentals: FundamentalsWidget,
  earnings: EarningsWidget,
};

// Drives the "add widget" menu and panel titles. Grouped + described to power
// the 320px Add menu (search-filterable, ordered by group).
export type WidgetGroup = "Charts" | "Trade" | "Market data" | "Activity";

export interface WidgetMeta {
  id: string;
  title: string;
  group: WidgetGroup;
  desc: string;
  iconPath: string;
}

export const WIDGET_CATALOG: WidgetMeta[] = [
  {
    id: "chart",
    group: "Charts",
    title: "Chart",
    desc: "Full TradingView chart with indicators & drawings",
    iconPath: "M2 13L6 8L9 11L14 4 M2 14 L14 14",
  },
  {
    id: "minichart",
    group: "Charts",
    title: "Mini chart",
    desc: "Lightweight chart — better for small panels and many-up grids",
    iconPath: "M2 11 L5 8 L8 10 L13 5 M2 14 L14 14",
  },
  {
    id: "trade",
    group: "Trade",
    title: "Trade ticket",
    desc: "Inline order entry, symbol-linked",
    iconPath: "M3 6 L13 6 L10 3 M13 10 L3 10 L6 13",
  },
  {
    id: "account",
    group: "Trade",
    title: "Account",
    desc: "Equity, day P/L, buying power & cash",
    iconPath: "M3 14 V8 L8 4 L13 8 V14 Z M7 14 V11 H9 V14",
  },
  {
    id: "watchlist",
    group: "Market data",
    title: "Watchlist",
    desc: "Silo watchlist — click a card to set the linked symbol",
    iconPath: "M2 4 L14 4 M2 8 L14 8 M2 12 L10 12",
  },
  {
    id: "news",
    group: "Market data",
    title: "News",
    desc: "Symbol or market feed (per linked channel)",
    iconPath: "M3 3 H13 V13 H3 Z M5 6 H11 M5 9 H11 M5 12 H9",
  },
  {
    id: "profile",
    group: "Market data",
    title: "Profile",
    desc: "Company & token identity — sector, supply, ATH, links",
    iconPath: "M2 8 A6 6 0 1 1 14 8 A6 6 0 1 1 2 8 M8 7.2 V11.2 M8 4.7 L8.01 4.7",
  },
  {
    id: "fundamentals",
    group: "Market data",
    title: "Fundamentals",
    desc: "Revenue & net-income trend, valuation, margins, growth (stocks)",
    iconPath: "M2 14 V9 H5 V14 Z M6.5 14 V5 H9.5 V14 Z M11 14 V7 H14 V14 Z M2 14 H14",
  },
  {
    id: "earnings",
    group: "Market data",
    title: "Earnings",
    desc: "Upcoming & recent earnings — one symbol or the market calendar",
    iconPath: "M3 2 V4 M11 2 V4 M2 5 H13 V13 H2 Z M2 7 H13 M5 9.5 H6 M8 9.5 H9",
  },
  {
    id: "positions",
    group: "Activity",
    title: "Positions",
    desc: "Open positions, filtered by linked symbol or whole account",
    iconPath: "M2 3 H14 V13 H2 Z M2 7 H14 M6 7 V13 M10 7 V13",
  },
  {
    id: "orders",
    group: "Activity",
    title: "Orders",
    desc: "Open & recent orders, filtered by linked symbol",
    iconPath: "M2 3 H14 V13 H2 Z M2 7 H14 M2 11 H14",
  },
  {
    id: "activity",
    group: "Activity",
    title: "Activity",
    desc: "Fills, transfers, dividends — all account activity",
    iconPath: "M2 8 L5 8 L7 4 L9 12 L11 8 L14 8",
  },
];

export const WIDGET_GROUPS: WidgetGroup[] = [
  "Charts",
  "Trade",
  "Market data",
  "Activity",
];

export const WIDGET_TITLES: Record<string, string> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.id, w.title]),
);

// Single-stroke 16×16 icon renderer for the Add menu rows and the empty-state
// CTA. Keeps the icon set inline / dependency-free.
export function WidgetIcon({
  path,
  size = 16,
}: {
  path: string;
  size?: number;
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d={path} />
    </svg>
  );
}
