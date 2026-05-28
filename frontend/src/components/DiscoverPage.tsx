import { useEffect, useMemo, useRef, useState } from "react";

import * as api from "../api";
import {
  useAccount,
  useAddToCryptoWatchlist,
  useAddToWatchlist,
  useBarsBatch,
  useCryptoTickers,
  useCryptoWatchlist,
  useEarningsCalendar,
  useEconomicCalendar,
  useIndices,
  useMarketNews,
  useMostActive,
  useMovers,
  useNews,
  usePositions,
  useRemoveFromCryptoWatchlist,
  useRemoveFromWatchlist,
  useSnapshots,
  useTrendingResearch,
  useWatchlist,
} from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import { useMarketSummary } from "../hooks/useMarketSummary";
import { useMobile } from "../hooks/useMobile";
import { isCryptoPosition } from "../lib/asset-class";
import { fmtCryptoPrice, pct } from "../lib/format";
import { showToast } from "../lib/toast";
import type { Snapshot } from "../types";
import { AssetSearch } from "./AssetSearch";
import { AddSymbolTile } from "./discover/AddSymbolTile";
import { CardsRow } from "./discover/CardsRow";
import { ChartCard } from "./discover/ChartCard";
import { CryptoTicker } from "./discover/CryptoTicker";
import { DiscoverHero } from "./discover/DiscoverHero";
import { EarningsCard, EarningsCardSkeleton } from "./discover/EarningsCard";
import { EconomicCard, EconomicCardSkeleton } from "./discover/EconomicCard";
import { HeroCardMobile } from "./discover/HeroCardMobile";
import { IndicesTicker } from "./discover/IndicesTicker";
import { MostActiveCard, MostActiveCardSkeleton } from "./discover/MostActiveCard";
import { MoversCard, MoversCardSkeleton } from "./discover/MoversCard";
import { MoversCombinedCard } from "./discover/MoversCombinedCard";
import { NewsCard, NewsCardSkeleton } from "./discover/NewsCard";
import { SparkCard, SparkCardSkeleton } from "./discover/SparkCard";
import {
  TrendingResearchCard,
  TrendingResearchCardSkeleton,
} from "./discover/TrendingResearchCard";
import { coinLabel, DONUT_COLORS_GREEN, fmtPrice } from "./discover/util";
import ErrorBanner from "./ErrorBanner";
import MarketSummaryCard from "./MarketSummaryCard";
import SectionHeading from "./SectionHeading";

type AssetClass = "stocks" | "crypto";

// Inline SVG chevron — used by the sidebar collapse toggle. No icon library
// in the repo so a tiny path is the lightest option.
function ChevronGlyph({ dir }: { dir: "left" | "right" }) {
  const d = dir === "left" ? "M9 4 5 8l4 4" : "M5 4l4 4-4 4";
  return (
    <svg width={12} height={12} viewBox="0 0 14 16" aria-hidden focusable="false">
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// Single Discover surface for both silos. The two silos share the whole
// scaffold (hero, AI summary, watchlist, inline chart, news) and differ only
// in: the price strip (equity indices vs crypto ticker), buying-power field,
// donut palette, watchlist copy, the stocks-only movers section, and the news
// source. Silo-specific data hooks are gated with `enabled` so the inactive
// silo never fetches. The market-summary hook takes the active silo directly,
// so switching silo regenerates that silo's summary (no double AI calls).
export default function DiscoverPage({
  assetClass,
  selected,
  onSelect,
}: {
  assetClass: AssetClass;
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  const isCrypto = assetClass === "crypto";

  const positions = usePositions();
  const account = useAccount();

  // App already subscribes to both watchlists app-wide, so this adds no fetch.
  const stockWatchlist = useWatchlist();
  const cryptoWatchlist = useCryptoWatchlist();
  const watchlist = isCrypto ? cryptoWatchlist : stockWatchlist;

  const addStock = useAddToWatchlist();
  const removeStock = useRemoveFromWatchlist();
  const addCrypto = useAddToCryptoWatchlist();
  const removeCrypto = useRemoveFromCryptoWatchlist();
  const addToWatchlist = isCrypto ? addCrypto : addStock;
  const removeFromWatchlist = isCrypto ? removeCrypto : removeStock;

  // Price strip — only the active silo's source fetches.
  const indices = useIndices(!isCrypto);
  const tickers = useCryptoTickers(isCrypto);
  // Crypto ticker price comes from the live stream (to match the chart); the
  // REST ticker call only seeds prev_close for the % change. The overlaid mid
  // refreshes the (duplicated) marquee items as ticks arrive.
  const tickerSymbols = useMemo(
    () => (tickers.data?.tickers ?? []).map((t) => t.symbol),
    [tickers.data],
  );
  const { quotes: tickerLive } = useLiveQuotes(tickerSymbols);
  const liveTickers = useMemo(
    () =>
      (tickers.data?.tickers ?? []).map((t) => ({
        ...t,
        last_price: tickerLive[t.symbol]?.mid ?? t.last_price,
      })),
    [tickers.data, tickerLive],
  );

  // Movers / most-active are stocks-only (Alpaca has no crypto screener).
  const movers = useMovers(8, !isCrypto);
  const mostActiveVolume = useMostActive(8, "volume", !isCrypto);
  const mostActiveTrades = useMostActive(8, "trades", !isCrypto);

  // Earnings + economic calendars are stocks-only (no crypto earnings; macro
  // shown in the equities silo).
  const earnings = useEarningsCalendar(!isCrypto);
  const economic = useEconomicCalendar([], !isCrypto);

  // Tipranks trending stocks — equities only (no crypto coverage).
  const trending = useTrendingResearch(!isCrypto);

  // News source differs per silo: market-wide headlines vs Alpaca BTC feed.
  const stockNews = useMarketNews(8, !isCrypto);
  const cryptoNews = useNews("BTC", 8, isCrypto);

  const wlSymbols = watchlist.data?.symbols ?? [];
  // Snapshot + live-quote universe includes the currently-selected symbol so
  // the sticky chart-mini bar has data even when the user picked from outside
  // the watchlist (e.g. clicked an Earnings calendar row).
  const quoteSymbols = useMemo(
    () => (selected && !wlSymbols.includes(selected) ? [...wlSymbols, selected] : wlSymbols),
    [wlSymbols.join(","), selected],
  );
  const snaps = useSnapshots(quoteSymbols);
  // Live stream price for the watchlist cards (matches the chart); snapshot
  // prev_close still drives the % change.
  const { quotes: live } = useLiveQuotes(quoteSymbols);
  const barsBatch = useBarsBatch(wlSymbols);
  const barsMap = barsBatch.data?.bars ?? {};
  const marketSummary = useMarketSummary(wlSymbols, assetClass);

  const [adding, setAdding] = useState(false);
  const isMobile = useMobile();
  const [addSheetOpen, setAddSheetOpen] = useState(false);

  // Sticky chart-mini visibility — true once the inline ChartCard has scrolled
  // past the top of the viewport. Desktop-only (mobile is short enough that
  // the chart's never far from view, and the slim bar would fight the mobile
  // header chrome).
  const chartCardRef = useRef<HTMLDivElement | null>(null);
  const [chartOffscreen, setChartOffscreen] = useState(false);
  useEffect(() => {
    if (isMobile) {
      setChartOffscreen(false);
      return;
    }
    const el = chartCardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // Only show when the chart has scrolled OFF the top — not when it
        // hasn't entered yet from below.
        const passedTop = entry.boundingClientRect.bottom < 0;
        setChartOffscreen(!entry.isIntersecting && passedTop);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [isMobile, selected]);
  // Watchlist sidebar collapse state — desktop only, persisted so the
  // preference survives reloads.
  const [sidebarCollapsed, setSidebarCollapsed] = useState(
    () =>
      typeof window !== "undefined" &&
      localStorage.getItem("discover_sidebar_collapsed_v1") === "1",
  );
  function toggleSidebar() {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem("discover_sidebar_collapsed_v1", next ? "1" : "0");
      } catch {
        /* private-mode quotas etc. — non-fatal */
      }
      return next;
    });
  }

  async function addSymbol(raw: string) {
    const v = raw.trim().toUpperCase();
    if (!v || adding) return;
    if (wlSymbols.includes(v)) {
      showToast(`${v} is already on your watchlist`, "info");
      return;
    }
    setAdding(true);
    // Validate with Alpaca first so a 404'd ticker can't be pushed onto
    // the watchlist (backend would accept it; it would never load quotes).
    try {
      const asset = await api.getAsset(v);
      if (!asset.tradable) {
        showToast(`${v} is not tradable on Alpaca`, "error");
        setAdding(false);
        return;
      }
    } catch {
      showToast(`${v} not found on Alpaca`, "error");
      setAdding(false);
      return;
    }
    addToWatchlist.mutate(v, {
      onSuccess: () => {
        setAdding(false);
        setAddSheetOpen(false);
        showToast(`${v} added to watchlist`, "success");
        onSelect(v);
      },
      onError: (err) => {
        setAdding(false);
        showToast(`Couldn't add ${v}: ${(err as Error).message}`, "error");
      },
    });
  }

  function removeWatchlistSymbol(sym: string) {
    removeFromWatchlist.mutate(sym, {
      onSuccess: () => showToast(`${sym} removed from watchlist`, "info"),
      onError: (err) =>
        showToast(`Couldn't remove ${sym}: ${(err as Error).message}`, "error"),
    });
  }

  const siloPositions = (positions.data?.positions || []).filter((p) =>
    isCrypto ? isCryptoPosition(p) : !isCryptoPosition(p),
  );
  const invested = siloPositions.reduce((s, p) => s + p.market_value, 0);
  const unrealized = siloPositions.reduce((s, p) => s + p.unrealized_pl, 0);
  const totalCostBasis = siloPositions.reduce((s, p) => s + p.cost_basis, 0);
  const unrealizedPct = totalCostBasis > 0 ? unrealized / totalCostBasis : 0;
  // Silo day P/L: sum of intraday unrealized P/L, as a % of prior-close value.
  const dayPl = siloPositions.reduce((s, p) => s + p.unrealized_intraday_pl, 0);
  const dayBasis = invested - dayPl;
  const dayPlPct = dayBasis > 0 ? dayPl / dayBasis : 0;

  // Quote map drives watchlist sparkline cards.
  const quotes: Record<string, Snapshot> = {};
  (snaps.data?.snapshots || []).forEach((s: Snapshot) => {
    quotes[s.symbol] = s;
  });

  // Cards container — sidebar mode (desktop) stacks cards vertically so the
  // watchlist reads as a left-rail column; everywhere else keeps the original
  // CardsRow (horizontal scroll on mobile / 2-3 col grid on tablet+).
  function CardsContainer({
    sidebar,
    children,
  }: {
    sidebar: boolean;
    children: React.ReactNode;
  }) {
    if (!sidebar) return <CardsRow>{children}</CardsRow>;
    return (
      <div
        className="grid gap-2 pb-1"
        style={{ gridTemplateColumns: "minmax(0, 1fr)" }}
      >
        {children}
      </div>
    );
  }

  const watchlistCountCtx = watchlist.isPending
    ? "loading…"
    : isCrypto
      ? `${wlSymbols.length} pair${wlSymbols.length === 1 ? "" : "s"}`
      : `${wlSymbols.length} symbol${wlSymbols.length === 1 ? "" : "s"}`;

  function renderWatchlistCards(sidebar: boolean) {
    if (watchlist.isPending) {
      return (
        <CardsContainer sidebar={sidebar}>
          {Array.from({ length: sidebar ? 4 : isCrypto ? 4 : 6 }).map((_, i) => (
            <SparkCardSkeleton key={i} />
          ))}
        </CardsContainer>
      );
    }
    if (wlSymbols.length === 0) {
      return (
        <CardsContainer sidebar={sidebar}>
          <AddSymbolTile
            assetClass={isCrypto ? "crypto" : "us_equity"}
            isCrypto={isCrypto}
            isMobile={isMobile}
            disabled={adding}
            onChoose={addSymbol}
            onMobileTap={() => setAddSheetOpen(true)}
          />
        </CardsContainer>
      );
    }
    return (
      <CardsContainer sidebar={sidebar}>
        {wlSymbols.map((sym) => {
          const q = quotes[sym];
          const last = live[sym]?.mid ?? q?.last_price ?? 0;
          const prev = q?.prev_close ?? 0;
          const dayChange = prev ? (last - prev) / prev : 0;
          const pos = siloPositions.find((p) => p.symbol === sym);
          return (
            <SparkCard
              key={sym}
              symbol={isCrypto ? coinLabel(sym) : sym}
              name={pos ? `${pos.qty} ${isCrypto ? "units" : "shares"}` : ""}
              price={last}
              changePct={dayChange}
              selected={sym === selected}
              onSelect={() => onSelect(sym)}
              onRemove={() => removeWatchlistSymbol(sym)}
              isCrypto={isCrypto}
              closes={barsMap[sym]?.map((b) => b.close)}
            />
          );
        })}
        <AddSymbolTile
          assetClass={isCrypto ? "crypto" : "us_equity"}
          isCrypto={isCrypto}
          isMobile={isMobile}
          disabled={adding}
          onChoose={addSymbol}
          onMobileTap={() => setAddSheetOpen(true)}
        />
      </CardsContainer>
    );
  }

  const tickerStrip = isCrypto ? (
    <CryptoTicker tickers={liveTickers} />
  ) : (
    indices.data && <IndicesTicker indices={indices.data.indices} />
  );

  const heroBlock = isMobile ? (
    <div className="mb-6">
      <HeroCardMobile
        account={account.data}
        title={isCrypto ? "Crypto" : "Stocks"}
        value={invested}
        dayPl={dayPl}
        dayPlPct={dayPlPct}
        unrealized={unrealized}
        unrealizedPct={unrealizedPct}
        buyingPower={
          isCrypto
            ? account.data?.non_marginable_buying_power ?? 0
            : account.data?.buying_power ?? 0
        }
        positions={siloPositions}
        colors={isCrypto ? undefined : DONUT_COLORS_GREEN}
      />
    </div>
  ) : (
    <DiscoverHero
      assetClass={assetClass}
      title={isCrypto ? "Crypto" : "Stocks"}
      value={invested}
      dayPl={dayPl}
      dayPlPct={dayPlPct}
      unrealized={unrealized}
      unrealizedPct={unrealizedPct}
      positions={siloPositions}
    />
  );

  const aiSummary = (
    <MarketSummaryCard
      cache={marketSummary.cache}
      isGenerating={marketSummary.isGenerating}
      windowLabel={marketSummary.windowLabel}
      onDismiss={marketSummary.dismiss}
      disabled={marketSummary.disabled}
    />
  );

  // Everything below the watchlist on mobile; everything except the watchlist
  // on the desktop main column. Defined inline so it captures the enclosing
  // scope (movers / earnings / economic / news queries + onSelect) without a
  // props explosion.
  // Live price + day-change for the selected symbol — same values the
  // SparkCards render so the mini bar tracks them. `selected` is always
  // included in quoteSymbols so the snapshot + live-quote fetches cover it
  // even when it's not on the watchlist.
  const selQuote = quotes[selected];
  const selPrice = live[selected]?.mid ?? selQuote?.last_price ?? 0;
  const selPrev = selQuote?.prev_close ?? 0;
  const selDayChange = selPrev > 0 ? (selPrice - selPrev) / selPrev : 0;
  const selUp = selDayChange >= 0;

  const mainContent = (
    <>
      {/* Inline chart */}
      <div ref={chartCardRef}>
        <ChartCard symbol={selected} />
      </div>

      {/* Movers + Most Active — stocks only */}
      {!isCrypto && (
        <>
          <SectionHeading label="Movers" ctxRight="free IEX feed" />
          {movers.error && <ErrorBanner message={movers.error.message} />}
          {mostActiveVolume.error && (
            <ErrorBanner message={mostActiveVolume.error.message} />
          )}
          {(!movers.data || !mostActiveVolume.data || !mostActiveTrades.data) &&
            !movers.error && (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <MoversCardSkeleton />
                <MostActiveCardSkeleton />
              </div>
            )}
          {movers.data &&
            mostActiveVolume.data &&
            mostActiveTrades.data &&
            (isMobile ? (
              <MoversCombinedCard
                gainers={movers.data.gainers}
                losers={movers.data.losers}
                active={mostActiveVolume.data.most_actives}
                onSelect={onSelect}
              />
            ) : (
              <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
                <MoversCard
                  gainers={movers.data.gainers}
                  losers={movers.data.losers}
                  onSelect={onSelect}
                />
                <MostActiveCard
                  volumeData={mostActiveVolume.data.most_actives}
                  tradesData={mostActiveTrades.data.most_actives}
                  onSelect={onSelect}
                />
              </div>
            ))}
        </>
      )}

      {/* Tipranks trending — stocks only */}
      {!isCrypto && (
        <>
          <SectionHeading label="Trending" ctx="by analyst coverage" />
          {trending.error && <ErrorBanner message={trending.error.message} />}
          {!trending.data && !trending.error && <TrendingResearchCardSkeleton />}
          {trending.data && (
            <TrendingResearchCard
              rows={trending.data.trending}
              onSelect={onSelect}
              dense={isMobile}
            />
          )}
        </>
      )}

      {/* Earnings + economic calendars — stocks only */}
      {!isCrypto && (
        <>
          <SectionHeading label="Earnings" ctx="next 2 weeks" />
          {earnings.error && <ErrorBanner message={earnings.error.message} />}
          {!earnings.data && !earnings.error && <EarningsCardSkeleton />}
          {earnings.data && (
            <EarningsCard
              rows={earnings.data.earnings}
              onSelect={onSelect}
              sortable
            />
          )}

          <SectionHeading label="Economic calendar" ctx="US · high & medium impact" />
          {economic.error && <ErrorBanner message={economic.error.message} />}
          {!economic.data && !economic.error && <EconomicCardSkeleton />}
          {economic.data && <EconomicCard rows={economic.data.economic} />}
        </>
      )}

      {/* News */}
      <SectionHeading
        label="News"
        ctx={isCrypto ? "crypto headlines" : "market headlines"}
      />
      {isCrypto ? (
        <>
          {cryptoNews.error && <ErrorBanner message={cryptoNews.error.message} />}
          {!cryptoNews.data && !cryptoNews.error && <NewsCardSkeleton />}
          {cryptoNews.data && cryptoNews.data.news.length > 0 && (
            <NewsCard
              articles={cryptoNews.data.news.map((n) => ({
                title: n.headline,
                link: n.url,
                summary: n.summary,
                source: n.source,
                pub_time: n.time,
              }))}
            />
          )}
          {cryptoNews.data && cryptoNews.data.news.length === 0 && (
            <div
              className="p-5 text-[13px]"
              style={{
                background: "var(--panel)",
                border: "1px solid var(--border)",
                borderRadius: "var(--r)",
                color: "var(--mute)",
              }}
            >
              No recent crypto news.
            </div>
          )}
        </>
      ) : (
        <>
          {stockNews.error && <ErrorBanner message={stockNews.error.message} />}
          {!stockNews.data && !stockNews.error && <NewsCardSkeleton />}
          {stockNews.data && <NewsCard articles={stockNews.data.articles} />}
        </>
      )}
    </>
  );

  return (
    <div className="max-w-[1280px] mx-auto pt-2">
      {/* Price strip — equity indices marquee (Yahoo, non-clickable) for
         stocks, live crypto ticker for crypto. */}
      {tickerStrip}

      {isMobile ? (
        <>
          {heroBlock}
          {aiSummary}
          <SectionHeading label="Watchlist" ctx={watchlistCountCtx} />
          {renderWatchlistCards(false)}
          {mainContent}
        </>
      ) : (
        <div
          className={`discover-grid items-start mt-4${sidebarCollapsed ? " is-collapsed" : ""}`}
        >
          <aside
            className={sidebarCollapsed ? undefined : "themed-scroll"}
            style={{
              position: "sticky",
              top: 16,
              alignSelf: "start",
              maxHeight: "calc(100vh - 32px)",
              overflowY: sidebarCollapsed ? "hidden" : "auto",
            }}
          >
            {sidebarCollapsed ? (
              <button
                type="button"
                onClick={toggleSidebar}
                aria-label="Show watchlist"
                title="Show watchlist"
                className="cursor-pointer flex items-center justify-center"
                style={{
                  width: 32,
                  height: 56,
                  background: "var(--panel)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--r)",
                  color: "var(--mute)",
                }}
              >
                <ChevronGlyph dir="right" />
              </button>
            ) : (
              <>
                {/* Inline heading row keeps the section title flush with the
                   top of the sidebar (the standalone SectionHeading's mt:24
                   was the source of the dead-space gap below the markets bar).
                   Collapse chevron sits beside the label, not absolutely
                   layered, so it gets a real flex slot. */}
                <div
                  className="flex items-center justify-between gap-2"
                  style={{ marginBottom: 8 }}
                >
                  <span
                    className="flex items-center gap-2 font-semibold"
                    style={{
                      fontSize: 11.5,
                      color: "var(--text-2)",
                      letterSpacing: "0.04em",
                      textTransform: "uppercase",
                    }}
                  >
                    <span>Watchlist</span>
                    <span
                      className="font-medium normal-case"
                      style={{
                        fontSize: 12,
                        color: "var(--mute)",
                        letterSpacing: 0,
                        textTransform: "none",
                      }}
                    >
                      {watchlistCountCtx}
                    </span>
                  </span>
                  <button
                    type="button"
                    onClick={toggleSidebar}
                    aria-label="Hide watchlist"
                    title="Hide watchlist"
                    className="cursor-pointer flex items-center justify-center"
                    style={{
                      width: 22,
                      height: 22,
                      background: "var(--panel)",
                      border: "1px solid var(--border)",
                      borderRadius: 4,
                      color: "var(--text-2)",
                      flexShrink: 0,
                    }}
                  >
                    <ChevronGlyph dir="left" />
                  </button>
                </div>
                {renderWatchlistCards(true)}
              </>
            )}
          </aside>
          <main className="min-w-0">
            {chartOffscreen && selected && (
              <div
                role="button"
                tabIndex={0}
                onClick={() =>
                  chartCardRef.current?.scrollIntoView({
                    behavior: "smooth",
                    block: "start",
                  })
                }
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    chartCardRef.current?.scrollIntoView({
                      behavior: "smooth",
                      block: "start",
                    });
                  }
                }}
                title={`Scroll back to ${selected} chart`}
                className="cursor-pointer flex items-center gap-3"
                style={{
                  position: "sticky",
                  top: 8,
                  zIndex: 20,
                  marginBottom: 12,
                  padding: "8px 14px",
                  background: "var(--text)",
                  color: "var(--bg)",
                  border: "none",
                  borderRadius: "var(--r)",
                  boxShadow: "var(--shadow-lg)",
                }}
              >
                <span className="font-semibold" style={{ fontSize: 13 }}>
                  {isCrypto ? coinLabel(selected) : selected}
                </span>
                <span
                  className="font-mono tabular-nums"
                  style={{ fontSize: 13 }}
                >
                  {isCrypto ? fmtCryptoPrice(selPrice) : fmtPrice(selPrice)}
                </span>
                <span
                  className="font-mono tabular-nums"
                  style={{
                    fontSize: 12,
                    color: selUp ? "var(--pos)" : "var(--neg)",
                  }}
                >
                  {pct(selDayChange)}
                </span>
                <span
                  className="ml-auto"
                  style={{ opacity: 0.6, fontSize: 11 }}
                >
                  Scroll to chart ↑
                </span>
              </div>
            )}
            {heroBlock}
            {aiSummary}
            {mainContent}
          </main>
        </div>
      )}

      {/* Mobile watchlist add sheet — replaces the heading input. */}
      {isMobile && addSheetOpen && (
        <div
          role="dialog"
          aria-modal="true"
          className="fixed inset-0 z-50"
          style={{ background: "rgba(20,22,28,0.45)" }}
          onClick={() => setAddSheetOpen(false)}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              background: "var(--panel)",
              borderTopLeftRadius: 18,
              borderTopRightRadius: 18,
              boxShadow: "var(--shadow-lg)",
              padding: "16px",
              paddingBottom: "max(var(--safe-bottom), 16px)",
              display: "flex",
              flexDirection: "column",
              gap: 12,
            }}
          >
            <div className="text-[14px] font-semibold">
              Add {isCrypto ? "crypto pair" : "symbol"} to watchlist
            </div>
            <AssetSearch
              variant="sheet"
              autoFocus
              assetClass={isCrypto ? "crypto" : "us_equity"}
              onChoose={addSymbol}
              disabled={adding}
            />
          </div>
        </div>
      )}
    </div>
  );
}
