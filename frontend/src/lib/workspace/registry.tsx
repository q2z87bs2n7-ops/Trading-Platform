import { createContext, useContext, useEffect, useRef, useState } from "react";
import type { IDockviewPanelHeaderProps, IDockviewPanelProps } from "dockview-react";
import { useContainerNarrow, useContainerTall } from "../../hooks/useContainerNarrow";
import Positions from "../../components/Positions";
import Orders from "../../components/Orders";
import Activities from "../../components/Activities";
import TVChartWidget from "../../components/TVChartWidget";
import PriceChart from "../../components/PriceChart";
import OrderTicketInline from "../../components/trade/OrderTicketInline";
import AccountPanel from "../../components/AccountPanel";
import AssetProfile from "../../components/AssetProfile";
import Fundamentals from "../../components/Fundamentals";
import Watchlist, { type WatchlistMode } from "../../components/Watchlist";
import { AssetSearch } from "../../components/AssetSearch";
import { NewsCard, NewsCardSkeleton } from "../../components/discover/NewsCard";
import {
  EarningsCard,
  EarningsCardSkeleton,
} from "../../components/discover/EarningsCard";
import {
  TrendingResearchCard,
  TrendingResearchCardSkeleton,
} from "../../components/discover/TrendingResearchCard";
import {
  SmartScoreCard,
  SmartScoreCardSkeleton,
} from "../../components/research/SmartScoreCard";
import {
  SentimentCard,
  SentimentCardSkeleton,
} from "../../components/research/SentimentCard";
import {
  AnalystRatingsCard,
  AnalystRatingsCardSkeleton,
} from "../../components/research/AnalystRatingsCard";
import {
  HedgeFundsCard,
  HedgeFundsCardSkeleton,
} from "../../components/research/HedgeFundsCard";
import {
  InsidersCard,
  InsidersCardSkeleton,
} from "../../components/research/InsidersCard";
import {
  RelatedTickersCard,
  RelatedTickersCardSkeleton,
} from "../../components/research/RelatedTickersCard";
import {
  HolderDemographicsCard,
  HolderDemographicsCardSkeleton,
} from "../../components/research/HolderDemographicsCard";
import ErrorBanner from "../../components/ErrorBanner";
import { isCryptoSymbol } from "../asset-class";
import {
  useEarningsCalendar,
  useMarketNews,
  useNews,
  useSymbolEarnings,
  useAnalystRatings,
  useHedgeFunds,
  useHolderDemographics,
  useInsiders,
  useRelatedTickers,
  useSentiment,
  useSmartScore,
  useTrendingResearch,
} from "../../data/hooks";

export type AssetClass = "stocks" | "crypto" | "cfd";

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
  tight,
}: {
  value: Channel;
  onChange: (c: Channel) => void;
  includeNone: boolean;
  tight?: boolean;
}) {
  const opts: Channel[] = includeNone
    ? ["none", ...SYMBOL_CHANNELS]
    : SYMBOL_CHANNELS;
  return (
    <div className={tight ? "flex items-center gap-0.5" : "flex items-center gap-1"}>
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
              width: tight ? 9 : 11,
              height: tight ? 9 : 11,
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
  // Self-measure so the header degrades gracefully on narrow panels: the
  // `· Kind` suffix drops first, then the channel picker tightens its gap.
  const headerRef = useRef<HTMLDivElement>(null);
  const headerNarrow = useContainerNarrow(headerRef, 260);
  return (
    <div
      ref={headerRef}
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
          {kind && !headerNarrow && (
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
        <ChannelPicker
          value={channel}
          onChange={setChannel}
          includeNone={includeNone}
          tight={headerNarrow}
        />
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

// Interim placeholder for widgets whose CFD branch hasn't landed yet (Phases
// 2–3 of docs/cfd-workspace-integration.md). Renders instead of passing "cfd"
// to an Alpaca-only feature component, which would otherwise show stock data in
// the CFD canvas (the wrong-silo bug this integration fixes).
function CfdPending({ kind }: { kind: string }) {
  return (
    <p className="text-[13px]" style={{ color: "var(--mute)" }}>
      {kind} isn’t wired for the CFD workspace yet.
    </p>
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
      <TVChartWidget
        symbol={symbol}
        onSymbolChange={setSymbol}
        assetClass={assetClass}
        panelApi={props.api}
      />
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
        {assetClass === "cfd" ? (
          <div style={{ padding: 12 }}>
            <CfdPending kind="Mini chart" />
          </div>
        ) : (
          <PriceChart symbol={symbol} responsive />
        )}
      </div>
    </WidgetShell>
  );
}

// Table→stacked-card flip widths, tuned per widget by column count. Orders has
// the widest table (11 cols) so it flips earliest; Activities is the narrowest.
const POSITIONS_DENSE_W = 480;
const POSITIONS_TALL_H = 600;
const ORDERS_DENSE_W = 560;
const ORDERS_MID_W = 760;
const ACTIVITY_DENSE_W = 360;
const PROFILE_DENSE_W = 340;
const FUNDAMENTALS_DENSE_W = 400;
const FUNDAMENTALS_WIDE_W = 560;
const EARNINGS_DENSE_W = 420;
const EARNINGS_TIGHT_W = 320;
const TRENDING_DENSE_W = 360;
const ANALYSTS_DENSE_W = 380;
const HEDGEFUNDS_DENSE_W = 420;
const HEDGEFUNDS_NARROW_W = 340;
const INSIDERS_DENSE_W = 420;
const INSIDERS_NARROW_W = 340;
// Responsive tiers for new widgets. SmartScore + Sentiment are
// flex-based vertical stacks that adapt naturally to narrow widths —
// no explicit breakpoint needed (rows already use justify-between +
// truncate). Documented in docs/workspace.md size-fit section.
const RELATED_TICKERS_DENSE_W = 320;
const RELATED_TICKERS_NARROW_W = 240;
const HOLDER_DEMOGRAPHICS_NARROW_W = 360;
const NEWS_COMPACT_W = 320;

function PositionsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "none");
  const symbol = channel === "none" ? undefined : getSymbol(channel);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, POSITIONS_DENSE_W);
  const tall = useContainerTall(ref, POSITIONS_TALL_H);
  // Tall+narrow docks fit more rows when the stacked-card padding tightens.
  const compact = dense && tall;
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
            compact={compact}
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
  // mid is "narrower than full but wider than dense" — hides TIF + Submitted
  // columns. Only meaningful when dense is false.
  const mid = useContainerNarrow(ref, ORDERS_MID_W) && !dense;
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
          {assetClass === "cfd" ? (
            <CfdPending kind="Orders" />
          ) : (
            <Orders assetClass={assetClass} symbol={symbol} dense={dense} mid={mid} bare />
          )}
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
          <Activities bare symbol={symbol} dense={dense} assetClass={assetClass} />
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
  const ref = useRef<HTMLDivElement>(null);
  const compact = useContainerNarrow(ref, NEWS_COMPACT_W);

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
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          {useMarket ? (
            <>
              {market.error && <ErrorBanner message={market.error.message} />}
              {!market.data && !market.error && <NewsCardSkeleton bare />}
              {market.data && (
                <NewsCard articles={market.data.articles} bare compact={compact} />
              )}
            </>
          ) : (
            <>
              {perSymbol.error && <ErrorBanner message={perSymbol.error.message} />}
              {!perSymbol.data && !perSymbol.error && <NewsCardSkeleton bare />}
              {perSymbol.data && (
                <NewsCard
                  bare
                  compact={compact}
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
      </div>
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
  const [mode, setLocalMode] = useState<WatchlistMode>(
    () => (props.params?.watchlistMode as WatchlistMode) ?? "auto",
  );
  const setMode = (m: WatchlistMode) => {
    setLocalMode(m);
    props.api.updateParameters({ ...props.params, watchlistMode: m });
  };
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
        {assetClass === "cfd" ? (
          <CfdPending kind="Watchlist" />
        ) : (
          <Watchlist
            assetClass={assetClass}
            selected={getSymbol(target)}
            onSelect={(s) => setSymbol(target, s)}
            mode={mode}
            onModeChange={setMode}
          />
        )}
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
        {assetClass === "cfd" ? (
          <CfdPending kind="Account" />
        ) : (
          <AccountPanel assetClass={assetClass} />
        )}
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
        {assetClass === "cfd" ? (
          <CfdPending kind="Trade ticket" />
        ) : (
          <OrderTicketInline symbol={sym} />
        )}
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
          {assetClass === "cfd" ? (
            <CfdPending kind="Profile" />
          ) : (
            <AssetProfile symbol={symbol} assetClass={assetClass} dense={dense} />
          )}
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
  const dense = useContainerNarrow(ref, FUNDAMENTALS_DENSE_W);
  const wide = !useContainerNarrow(ref, FUNDAMENTALS_WIDE_W) && !dense;
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
          {assetClass === "cfd" ? (
            <CfdPending kind="Fundamentals" />
          ) : (
            <Fundamentals symbol={symbol} assetClass={assetClass} dense={dense} wide={wide} />
          )}
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
  // Very narrow → also suppress the year suffix in the date column so the
  // per-symbol view drops from 72px to 48px before the dense flip kicks in.
  const tight = useContainerNarrow(ref, EARNINGS_TIGHT_W);

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
                  showYear={!isMarket && !tight}
                  onSelect={(s) => setSymbol(channel, s)}
                  sortable={isMarket}
                />
              )}
            </>
          )}
        </Pane>
      </div>
    </WidgetShell>
  );
}

// Trending widget: whole-market Tipranks trending list (no symbol input).
// Stocks-only — the upstream has no crypto coverage. The channel selector
// exists so a row click can push the picked ticker into a shared channel
// (mirrors WatchlistWidget); the data view itself is always the full list.
function TrendingResearchWidget(props: IDockviewPanelProps) {
  const { setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const target = channel === "none" ? "main" : channel;
  const isCrypto = assetClass === "crypto";
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, TRENDING_DENSE_W);
  const trending = useTrendingResearch(!isCrypto);

  return (
    <WidgetShell
      header={
        <LinkHeader
          label="Market"
          channel={channel}
          setChannel={setChannel}
          includeNone
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          {isCrypto ? (
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              Trending research is stocks-only.
            </p>
          ) : (
            <>
              {trending.error && <ErrorBanner message={trending.error.message} />}
              {!trending.data && !trending.error && (
                <TrendingResearchCardSkeleton bare />
              )}
              {trending.data && (
                <TrendingResearchCard
                  rows={trending.data.trending}
                  bare
                  dense={dense}
                  onSelect={(s) => setSymbol(target, s)}
                />
              )}
            </>
          )}
        </Pane>
      </div>
    </WidgetShell>
  );
}

// SmartScore widget: per-symbol Tipranks composite (1-10) + 6 components.
// Stocks-only (Tipranks doesn't cover crypto); default Main channel, no None
// (always shows ONE symbol — mirrors Profile/Fundamentals).
function SmartScoreWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const isCrypto = assetClass === "crypto" || isCryptoSymbol(symbol);
  const score = useSmartScore(symbol, !isCrypto && symbol.length > 0);

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol || "—"}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
          kind="SmartScore"
        />
      }
    >
      <Pane pad>
        {isCrypto ? (
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            SmartScore is stocks-only. Link this widget to a stock symbol.
          </p>
        ) : (
          <>
            {score.error && <ErrorBanner message={score.error.message} />}
            {!score.data && !score.error && <SmartScoreCardSkeleton bare />}
            {score.data && (
              <SmartScoreCard row={score.data.smart_score} bare />
            )}
          </>
        )}
      </Pane>
    </WidgetShell>
  );
}

// Sentiment widget: combined blogger + news + Tipranks-investor signals
// for one stock. Stocks-only, default Main channel.
function SentimentWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const isCrypto = assetClass === "crypto" || isCryptoSymbol(symbol);
  const sent = useSentiment(symbol, !isCrypto && symbol.length > 0);

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol || "—"}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
          kind="Sentiment"
        />
      }
    >
      <Pane pad>
        {isCrypto ? (
          <p className="text-[13px]" style={{ color: "var(--mute)" }}>
            Sentiment is stocks-only. Link this widget to a stock symbol.
          </p>
        ) : (
          <>
            {sent.error && <ErrorBanner message={sent.error.message} />}
            {!sent.data && !sent.error && <SentimentCardSkeleton bare />}
            {sent.data && <SentimentCard row={sent.data.sentiment} bare />}
          </>
        )}
      </Pane>
    </WidgetShell>
  );
}

// Analyst Ratings widget: per-analyst list for one stock. Stocks-only,
// default Main channel; dense breakpoint collapses the firm column.
function AnalystRatingsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const isCrypto = assetClass === "crypto" || isCryptoSymbol(symbol);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, ANALYSTS_DENSE_W);
  const ratings = useAnalystRatings(symbol, !isCrypto && symbol.length > 0);

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol || "—"}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
          kind="Ratings"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          {isCrypto ? (
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              Analyst ratings are stocks-only. Link this widget to a stock.
            </p>
          ) : (
            <>
              {ratings.error && <ErrorBanner message={ratings.error.message} />}
              {!ratings.data && !ratings.error && (
                <AnalystRatingsCardSkeleton bare />
              )}
              {ratings.data && (
                <AnalystRatingsCard
                  rows={ratings.data.analysts}
                  bare
                  dense={dense}
                />
              )}
            </>
          )}
        </Pane>
      </div>
    </WidgetShell>
  );
}

// HedgeFunds widget: Tipranks 13F flow + per-fund holdings for one stock.
// Stocks-only, default Main channel. Quarterly cadence underneath so the
// hook TTL is long (6h).
function HedgeFundsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const isCrypto = assetClass === "crypto" || isCryptoSymbol(symbol);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, HEDGEFUNDS_DENSE_W);
  const narrow = useContainerNarrow(ref, HEDGEFUNDS_NARROW_W);
  const data = useHedgeFunds(symbol, !isCrypto && symbol.length > 0);

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol || "—"}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
          kind="Hedge Funds"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          {isCrypto ? (
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              Hedge-fund flow is stocks-only. Link this widget to a stock.
            </p>
          ) : (
            <>
              {data.error && <ErrorBanner message={data.error.message} />}
              {!data.data && !data.error && <HedgeFundsCardSkeleton bare />}
              {data.data && (
                <HedgeFundsCard
                  row={data.data.hedge_funds}
                  bare
                  dense={dense}
                  narrow={narrow}
                />
              )}
            </>
          )}
        </Pane>
      </div>
    </WidgetShell>
  );
}

// Insiders widget: Form-4 transactions + monthly bars for one stock.
function InsidersWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const isCrypto = assetClass === "crypto" || isCryptoSymbol(symbol);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, INSIDERS_DENSE_W);
  const narrow = useContainerNarrow(ref, INSIDERS_NARROW_W);
  const data = useInsiders(symbol, !isCrypto && symbol.length > 0);

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol || "—"}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
          kind="Insiders"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          {isCrypto ? (
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              Insider activity is stocks-only. Link this widget to a stock.
            </p>
          ) : (
            <>
              {data.error && <ErrorBanner message={data.error.message} />}
              {!data.data && !data.error && <InsidersCardSkeleton bare />}
              {data.data && (
                <InsidersCard
                  row={data.data.insiders}
                  bare
                  dense={dense}
                  narrow={narrow}
                />
              )}
            </>
          )}
        </Pane>
      </div>
    </WidgetShell>
  );
}

// RelatedTickers widget: 'investorsAlsoBought' — tickers also held by
// investors who hold the linked symbol. Per-cohort selector inside the
// card. Row click writes the picked ticker into the widget's channel.
function RelatedTickersWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const isCrypto = assetClass === "crypto" || isCryptoSymbol(symbol);
  const ref = useRef<HTMLDivElement>(null);
  const dense = useContainerNarrow(ref, RELATED_TICKERS_DENSE_W);
  const narrow = useContainerNarrow(ref, RELATED_TICKERS_NARROW_W);
  const data = useRelatedTickers(symbol, !isCrypto && symbol.length > 0);

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol || "—"}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
          kind="Related"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          {isCrypto ? (
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              Related tickers are stocks-only. Link this widget to a stock.
            </p>
          ) : (
            <>
              {data.error && <ErrorBanner message={data.error.message} />}
              {!data.data && !data.error && (
                <RelatedTickersCardSkeleton bare />
              )}
              {data.data && (
                <RelatedTickersCard
                  row={data.data.related}
                  bare
                  dense={dense}
                  narrow={narrow}
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

// HolderDemographics widget: ageDistribution × 3 cohorts + sector/best
// benchmark footer. Side-by-side cohorts at full width; stacks vertically
// at narrow widths.
function HolderDemographicsWidget(props: IDockviewPanelProps) {
  const { getSymbol, setSymbol, assetClass } = useWorkspace();
  const [channel, setChannel] = useChannel(props, "main");
  const symbol = getSymbol(channel).toUpperCase();
  const isCrypto = assetClass === "crypto" || isCryptoSymbol(symbol);
  const ref = useRef<HTMLDivElement>(null);
  const narrow = useContainerNarrow(ref, HOLDER_DEMOGRAPHICS_NARROW_W);
  const data = useHolderDemographics(symbol, !isCrypto && symbol.length > 0);

  return (
    <WidgetShell
      header={
        <LinkHeader
          label={symbol || "—"}
          channel={channel}
          setChannel={setChannel}
          includeNone={false}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(channel, s)}
          kind="Holders"
        />
      }
    >
      <div ref={ref} style={{ height: "100%" }}>
        <Pane pad>
          {isCrypto ? (
            <p className="text-[13px]" style={{ color: "var(--mute)" }}>
              Holder demographics are stocks-only.
            </p>
          ) : (
            <>
              {data.error && <ErrorBanner message={data.error.message} />}
              {!data.data && !data.error && (
                <HolderDemographicsCardSkeleton bare />
              )}
              {data.data && (
                <HolderDemographicsCard
                  row={data.data.demographics}
                  bare
                  narrow={narrow}
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
  trending: TrendingResearchWidget,
  smartscore: SmartScoreWidget,
  sentiment: SentimentWidget,
  analysts: AnalystRatingsWidget,
  hedgefunds: HedgeFundsWidget,
  insiders: InsidersWidget,
  relatedtickers: RelatedTickersWidget,
  holderdemographics: HolderDemographicsWidget,
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
  // Market data — alphabetized by title for predictable menu scanning.
  {
    id: "analysts",
    group: "Market data",
    title: "Analyst Ratings",
    desc: "Per-analyst rating list (firm, recommendation, date) for one stock",
    iconPath: "M3 4 H13 M3 8 H13 M3 12 H10",
  },
  {
    id: "earnings",
    group: "Market data",
    title: "Earnings",
    desc: "Upcoming & recent earnings — one symbol or the market calendar",
    iconPath: "M3 2 V4 M11 2 V4 M2 5 H13 V13 H2 Z M2 7 H13 M5 9.5 H6 M8 9.5 H9",
  },
  {
    id: "fundamentals",
    group: "Market data",
    title: "Fundamentals",
    desc: "Revenue & net-income trend, valuation, margins, growth (stocks)",
    iconPath: "M2 14 V9 H5 V14 Z M6.5 14 V5 H9.5 V14 Z M11 14 V7 H14 V14 Z M2 14 H14",
  },
  {
    id: "hedgefunds",
    group: "Market data",
    title: "Hedge Funds",
    desc: "13F-derived hedge-fund flow + per-fund holdings for one stock",
    iconPath: "M2 13 H14 M4 13 V8 L8 4 L12 8 V13 M7 13 V10 H9 V13",
  },
  {
    id: "holderdemographics",
    group: "Market data",
    title: "Holder Demographics",
    desc: "Per-age-cohort behavioural profile of who holds the stock",
    iconPath: "M5 5 A2 2 0 1 1 5 9 A2 2 0 1 1 5 9 M11 5 A2 2 0 1 1 11 9 A2 2 0 1 1 11 9 M2 14 V12 A2 2 0 0 1 4 10 H6 A2 2 0 0 1 8 12 M8 14 V12 A2 2 0 0 1 10 10 H12 A2 2 0 0 1 14 12",
  },
  {
    id: "insiders",
    group: "Market data",
    title: "Insiders",
    desc: "Form-4 insider transactions + monthly buy/sell history for one stock",
    iconPath: "M8 8 A2.5 2.5 0 1 1 8 3 A2.5 2.5 0 1 1 8 8 M3 14 V12 A3 3 0 0 1 6 9 H10 A3 3 0 0 1 13 12 V14",
  },
  {
    id: "relatedtickers",
    group: "Market data",
    title: "Related Tickers",
    desc: "Other tickers held by investors who hold this stock",
    iconPath: "M4 4 H8 V8 H4 Z M10 4 H14 V8 H10 Z M4 10 H8 V14 H4 Z M10 10 H14 V14 H10 Z M8 6 H10 M6 8 V10 M12 8 V10",
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
    id: "sentiment",
    group: "Market data",
    title: "Sentiment",
    desc: "Combined blogger / news / Tipranks-investor sentiment for one stock",
    iconPath: "M3 9 H6 L8 4 L10 12 L12 9 H13",
  },
  {
    id: "smartscore",
    group: "Market data",
    title: "SmartScore",
    desc: "Tipranks composite signal (1-10) + 6 components for one stock",
    iconPath: "M2 14 L8 2 L14 14 Z M5 11 H11",
  },
  {
    id: "trending",
    group: "Market data",
    title: "Trending",
    desc: "Top trending stocks by analyst coverage (Tipranks; stocks-only)",
    iconPath: "M2 12 L6 7 L9 10 L13 4 M10 4 H13 V7",
  },
  {
    id: "watchlist",
    group: "Market data",
    title: "Watchlist",
    desc: "Silo watchlist — click a card to set the linked symbol",
    iconPath: "M2 4 L14 4 M2 8 L14 8 M2 12 L10 12",
  },
  // Activity — alphabetized by title.
  {
    id: "activity",
    group: "Activity",
    title: "Activity",
    desc: "Fills, transfers, dividends — all account activity",
    iconPath: "M2 8 L5 8 L7 4 L9 12 L11 8 L14 8",
  },
  {
    id: "orders",
    group: "Activity",
    title: "Orders",
    desc: "Open & recent orders, filtered by linked symbol",
    iconPath: "M2 3 H14 V13 H2 Z M2 7 H14 M2 11 H14",
  },
  {
    id: "positions",
    group: "Activity",
    title: "Positions",
    desc: "Open positions, filtered by linked symbol or whole account",
    iconPath: "M2 3 H14 V13 H2 Z M2 7 H14 M6 7 V13 M10 7 V13",
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
