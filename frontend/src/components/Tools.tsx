import { useState } from "react";

import * as api from "../api";
import {
  useAccount,
  useAddToWatchlist,
  useIndices,
  useMarketNews,
  useMostActive,
  useMovers,
  usePositions,
  useRemoveFromWatchlist,
  useSnapshots,
  useWatchlist,
} from "../data/hooks";
import { showToast } from "../lib/toast";
import type { Position, Snapshot } from "../types";
import { AllocationCard } from "./discover/AllocationCard";
import { BalanceCard } from "./discover/BalanceCard";
import { CardsRow } from "./discover/CardsRow";
import { ChartCard } from "./discover/ChartCard";
import { IndicesTicker } from "./discover/IndicesTicker";
import { MostActiveCard, MostActiveCardSkeleton } from "./discover/MostActiveCard";
import { MoversCard, MoversCardSkeleton } from "./discover/MoversCard";
import { NewsCard, NewsCardSkeleton } from "./discover/NewsCard";
import { SparkCard, SparkCardSkeleton } from "./discover/SparkCard";
import ErrorBanner from "./ErrorBanner";
import MarketSummaryCard from "./MarketSummaryCard";
import SectionHeading from "./SectionHeading";
import { useMarketSummary } from "../hooks/useMarketSummary";

export default function Tools({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  const positions = usePositions();
  const account = useAccount();
  const indices = useIndices();
  const movers = useMovers(8);
  const mostActiveVolume = useMostActive(8, "volume");
  const mostActiveTrades = useMostActive(8, "trades");
  const news = useMarketNews(8);
  const watchlist = useWatchlist();
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const wlSymbols = watchlist.data?.symbols ?? [];
  const snaps = useSnapshots(wlSymbols);
  const marketSummary = useMarketSummary(wlSymbols);
  const [wlInput, setWlInput] = useState("");
  const [adding, setAdding] = useState(false);

  async function submitAddWatchlist(e: React.FormEvent) {
    e.preventDefault();
    const v = wlInput.trim().toUpperCase();
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
        setWlInput("");
        setAdding(false);
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

  const invested = (positions.data?.positions || []).reduce(
    (s: number, p: Position) => s + p.market_value,
    0,
  );
  const unrealized = (positions.data?.positions || []).reduce(
    (s: number, p: Position) => s + p.unrealized_pl,
    0,
  );
  const totalCostBasis = (positions.data?.positions || []).reduce(
    (s: number, p: Position) => s + p.cost_basis,
    0,
  );
  const unrealizedPct = totalCostBasis > 0 ? unrealized / totalCostBasis : 0;

  // Quote map drives watchlist sparkline cards.
  const quotes: Record<string, Snapshot> = {};
  (snaps.data?.snapshots || []).forEach((s: Snapshot) => {
    quotes[s.symbol] = s;
  });

  return (
    <div className="max-w-[1280px] mx-auto pt-2">
      {/* Markets marquee — Yahoo Finance indices, non-clickable since Alpaca
         can't serve bars for ^IXIC / ^DJI / etc. */}
      {indices.data && <IndicesTicker indices={indices.data.indices} />}

      {/* Hero row */}
      <div className="grid gap-4 mb-6 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        <BalanceCard
          account={account.data}
          invested={invested}
          unrealized={unrealized}
          unrealizedPct={unrealizedPct}
        />
        <AllocationCard positions={positions.data?.positions} />
      </div>

      {/* AI market summary — auto-generated per time window, dismissible */}
      <MarketSummaryCard
        cache={marketSummary.cache}
        isGenerating={marketSummary.isGenerating}
        windowLabel={marketSummary.windowLabel}
        onDismiss={marketSummary.dismiss}
      />

      {/* Watchlist */}
      <SectionHeading
        label="Watchlist"
        ctx={
          watchlist.isPending
            ? "loading…"
            : `${wlSymbols.length} symbol${wlSymbols.length === 1 ? "" : "s"}`
        }
        ctxRight={
          <form
            onSubmit={submitAddWatchlist}
            className="inline-flex items-center gap-1"
          >
            <input
              value={wlInput}
              onChange={(e) => setWlInput(e.target.value.toUpperCase())}
              placeholder="+ SYMBOL"
              aria-label="Add symbol to watchlist"
              className="font-mono text-[11.5px] tabular-nums"
              style={{
                background: "var(--panel-2)",
                border: "1px solid var(--border)",
                borderRadius: 6,
                color: "var(--text)",
                padding: "3px 8px",
                width: 110,
              }}
            />
            <button
              type="submit"
              disabled={!wlInput.trim() || adding}
              className="text-[12px] cursor-pointer"
              style={{
                background: "var(--accent-bg)",
                color: "var(--accent)",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                padding: "3px 8px",
                opacity: wlInput.trim() && !adding ? 1 : 0.5,
              }}
            >
              {adding ? "…" : "Add"}
            </button>
          </form>
        }
      />
      {watchlist.isPending ? (
        <CardsRow>
          {Array.from({ length: 6 }).map((_, i) => (
            <SparkCardSkeleton key={i} />
          ))}
        </CardsRow>
      ) : wlSymbols.length === 0 ? (
        <div
          className="p-5 text-[13px]"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            color: "var(--mute)",
          }}
        >
          Your watchlist is empty. Type a ticker above to add one.
        </div>
      ) : (
        <CardsRow>
          {wlSymbols.map((sym) => {
            const q = quotes[sym];
            const last = q?.last_price ?? 0;
            const dayChange =
              q?.prev_close && q?.last_price
                ? (q.last_price - q.prev_close) / q.prev_close
                : 0;
            const pos = (positions.data?.positions || []).find(
              (p: Position) => p.symbol === sym,
            );
            return (
              <SparkCard
                key={sym}
                symbol={sym}
                name={pos ? `${pos.qty} shares` : ""}
                price={last}
                changePct={dayChange}
                selected={sym === selected}
                onSelect={() => onSelect(sym)}
                onRemove={() => removeWatchlistSymbol(sym)}
              />
            );
          })}
        </CardsRow>
      )}

      {/* Inline chart */}
      <ChartCard symbol={selected} />

      {/* Movers + Most Active */}
      <SectionHeading label="Movers" ctxRight="free IEX feed" />
      {movers.error && <ErrorBanner message={movers.error.message} />}
      {mostActiveVolume.error && <ErrorBanner message={mostActiveVolume.error.message} />}
      {(!movers.data || !mostActiveVolume.data || !mostActiveTrades.data) && !movers.error && (
        <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
          <MoversCardSkeleton />
          <MostActiveCardSkeleton />
        </div>
      )}
      {movers.data && mostActiveVolume.data && mostActiveTrades.data && (
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
      )}

      {/* News */}
      <SectionHeading label="News" ctx="market headlines" />
      {news.error && <ErrorBanner message={news.error.message} />}
      {!news.data && !news.error && <NewsCardSkeleton />}
      {news.data && <NewsCard articles={news.data.articles} />}
    </div>
  );
}
