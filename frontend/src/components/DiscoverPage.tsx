import { useMemo, useState } from "react";

import * as api from "../api";
import {
  useAccount,
  useAddToCryptoWatchlist,
  useAddToWatchlist,
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
  useWatchlist,
} from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import { useMarketSummary } from "../hooks/useMarketSummary";
import { useMobile } from "../hooks/useMobile";
import { isCryptoPosition } from "../lib/asset-class";
import { showToast } from "../lib/toast";
import type { Snapshot } from "../types";
import { AssetSearch } from "./AssetSearch";
import { AllocationCard } from "./discover/AllocationCard";
import { BalanceCard } from "./discover/BalanceCard";
import { CardsRow } from "./discover/CardsRow";
import { ChartCard } from "./discover/ChartCard";
import { CryptoTicker } from "./discover/CryptoTicker";
import { EarningsCard, EarningsCardSkeleton } from "./discover/EarningsCard";
import { EconomicCard, EconomicCardSkeleton } from "./discover/EconomicCard";
import { HeroCardMobile } from "./discover/HeroCardMobile";
import { IndicesTicker } from "./discover/IndicesTicker";
import { MostActiveCard, MostActiveCardSkeleton } from "./discover/MostActiveCard";
import { MoversCard, MoversCardSkeleton } from "./discover/MoversCard";
import { MoversCombinedCard } from "./discover/MoversCombinedCard";
import { NewsCard, NewsCardSkeleton } from "./discover/NewsCard";
import { SparkCard, SparkCardSkeleton } from "./discover/SparkCard";
import { coinLabel, DONUT_COLORS_GREEN } from "./discover/util";
import ErrorBanner from "./ErrorBanner";
import MarketSummaryCard from "./MarketSummaryCard";
import SectionHeading from "./SectionHeading";

type AssetClass = "stocks" | "crypto";

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
  const economic = useEconomicCalendar(!isCrypto);

  // News source differs per silo: market-wide headlines vs Alpaca BTC feed.
  const stockNews = useMarketNews(8, !isCrypto);
  const cryptoNews = useNews("BTC", 8, isCrypto);

  const wlSymbols = watchlist.data?.symbols ?? [];
  const snaps = useSnapshots(wlSymbols);
  // Live stream price for the watchlist cards (matches the chart); snapshot
  // prev_close still drives the % change.
  const { quotes: live } = useLiveQuotes(wlSymbols);
  const marketSummary = useMarketSummary(wlSymbols, assetClass);

  const [adding, setAdding] = useState(false);
  const isMobile = useMobile();
  const [addSheetOpen, setAddSheetOpen] = useState(false);

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

  return (
    <div className="max-w-[1280px] mx-auto pt-2">
      {/* Price strip — equity indices marquee (Yahoo, non-clickable) for
         stocks, live crypto ticker for crypto. */}
      {isCrypto ? (
        <CryptoTicker tickers={liveTickers} />
      ) : (
        indices.data && <IndicesTicker indices={indices.data.indices} />
      )}

      {/* Hero row — combined single card on mobile, two-card grid on desktop */}
      {isMobile ? (
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
        <div className="grid gap-4 mb-6 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
          <BalanceCard
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
          />
          <AllocationCard
            positions={siloPositions}
            colors={isCrypto ? undefined : DONUT_COLORS_GREEN}
          />
        </div>
      )}

      {/* AI market summary — auto-generated per time window, dismissible */}
      <MarketSummaryCard
        cache={marketSummary.cache}
        isGenerating={marketSummary.isGenerating}
        windowLabel={marketSummary.windowLabel}
        onDismiss={marketSummary.dismiss}
        disabled={marketSummary.disabled}
      />

      {/* Watchlist */}
      <SectionHeading
        label="Watchlist"
        ctx={
          watchlist.isPending
            ? "loading…"
            : isCrypto
              ? `${wlSymbols.length} pair${wlSymbols.length === 1 ? "" : "s"}`
              : `${wlSymbols.length} symbol${wlSymbols.length === 1 ? "" : "s"}`
        }
        ctxRight={
          isMobile ? undefined : (
            <AssetSearch
              assetClass={isCrypto ? "crypto" : "us_equity"}
              onChoose={addSymbol}
              disabled={adding}
            />
          )
        }
      />
      {watchlist.isPending ? (
        <CardsRow>
          {Array.from({ length: isCrypto ? 4 : 6 }).map((_, i) => (
            <SparkCardSkeleton key={i} />
          ))}
        </CardsRow>
      ) : wlSymbols.length === 0 ? (
        <div
          className="p-5 text-[13px] flex flex-col items-start gap-3"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            color: "var(--mute)",
          }}
        >
          <span>
            {isCrypto
              ? isMobile
                ? "Your crypto watchlist is empty. Add a pair (e.g. BTC/USD) to start."
                : "Your crypto watchlist is empty. Type a pair above (e.g. BTC/USD) to add one."
              : isMobile
                ? "Your watchlist is empty. Add a ticker to start."
                : "Your watchlist is empty. Type a ticker above to add one."}
          </span>
          {isMobile && (
            <button
              type="button"
              onClick={() => setAddSheetOpen(true)}
              className="text-[13px] font-medium cursor-pointer"
              style={{
                minHeight: "var(--mob-tap)",
                padding: "8px 16px",
                background: "var(--accent-bg)",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: 8,
              }}
            >
              + Add {isCrypto ? "pair" : "symbol"}
            </button>
          )}
        </div>
      ) : (
        <CardsRow>
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
              />
            );
          })}
          {isMobile && (
            <button
              type="button"
              onClick={() => setAddSheetOpen(true)}
              aria-label="Add to watchlist"
              style={{
                scrollSnapAlign: "start",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                minWidth: 90,
                border: "1.5px dashed var(--border-2)",
                borderRadius: "var(--r)",
                background: "transparent",
                color: "var(--accent)",
                fontSize: 13,
                fontWeight: 600,
                cursor: "pointer",
              }}
            >
              + Add
            </button>
          )}
        </CardsRow>
      )}

      {/* Inline chart */}
      <ChartCard symbol={selected} />

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

      {/* Earnings + economic calendars — stocks only */}
      {!isCrypto && (
        <>
          <SectionHeading label="Earnings" ctx="next 2 weeks" />
          {earnings.error && <ErrorBanner message={earnings.error.message} />}
          {!earnings.data && !earnings.error && <EarningsCardSkeleton />}
          {earnings.data && (
            <EarningsCard rows={earnings.data.earnings} onSelect={onSelect} />
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
