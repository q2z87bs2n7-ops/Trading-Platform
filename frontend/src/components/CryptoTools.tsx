import { useState } from "react";

import * as api from "../api";
import {
  useAccount,
  useAddToCryptoWatchlist,
  useCryptoTickers,
  useCryptoWatchlist,
  usePositions,
  useRemoveFromCryptoWatchlist,
  useSnapshots,
} from "../data/hooks";
import { showToast } from "../lib/toast";
import type { NewsItem, Position, Snapshot } from "../types";
import { AllocationCard } from "./discover/AllocationCard";
import { BalanceCard } from "./discover/BalanceCard";
import { CardsRow } from "./discover/CardsRow";
import { ChartCard } from "./discover/ChartCard";
import { NewsCard, NewsCardSkeleton } from "./discover/NewsCard";
import { SparkCard, SparkCardSkeleton } from "./discover/SparkCard";
import ErrorBanner from "./ErrorBanner";
import MarketSummaryCard from "./MarketSummaryCard";
import SectionHeading from "./SectionHeading";
import { useNews } from "../data/hooks";
import { useMarketSummary } from "../hooks/useMarketSummary";

// Strip "/USD" suffix for compact display (BTC/USD → BTC).
function coinLabel(symbol: string): string {
  return symbol.replace(/\/USD$/, "");
}

const money = (n: number, decimals = 2) =>
  n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });

function CryptoTicker({ tickers }: { tickers: Snapshot[] }) {
  if (!tickers.length) return null;
  return (
    <div
      className="overflow-hidden mb-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-center">
        <span
          className="text-[11px] uppercase font-semibold px-3 py-2 whitespace-nowrap shrink-0"
          style={{
            color: "var(--mute)",
            letterSpacing: "0.06em",
            borderRight: "1px solid var(--border)",
          }}
        >
          Crypto
        </span>
        <div className="ticker-wrap overflow-hidden flex-1" style={{ height: 36 }}>
          <div className="ticker-track h-full items-center">
            {[...tickers, ...tickers].map((t, i) => {
              const last = t.last_price ?? 0;
              const prev = t.prev_close ?? 0;
              const changePct = prev ? (last - prev) / prev : 0;
              const up = changePct >= 0;
              const color = up ? "var(--pos)" : "var(--neg)";
              const decimals = last < 1 ? 4 : last < 10 ? 3 : 2;
              return (
                <span
                  key={i}
                  className="flex items-center gap-2 px-4 whitespace-nowrap"
                  style={{ borderRight: "1px solid var(--hairline)" }}
                >
                  <span
                    className="text-[11px] font-semibold"
                    style={{ color: "var(--mute)" }}
                  >
                    {coinLabel(t.symbol)}
                  </span>
                  <span className="text-[13px] font-semibold tabular-nums">
                    {money(last, decimals)}
                  </span>
                  <span
                    className="text-[12px] tabular-nums font-medium"
                    style={{ color }}
                  >
                    {up ? "+" : ""}
                    {(changePct * 100).toFixed(2)}%
                  </span>
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function CryptoTools({
  selected,
  onSelect,
}: {
  selected: string;
  onSelect: (symbol: string) => void;
}) {
  const positions = usePositions();
  const account = useAccount();
  const tickers = useCryptoTickers();
  const watchlist = useCryptoWatchlist();
  const addToWatchlist = useAddToCryptoWatchlist();
  const removeFromWatchlist = useRemoveFromCryptoWatchlist();
  const wlSymbols = watchlist.data?.symbols ?? [];
  const snaps = useSnapshots(wlSymbols);
  const marketSummary = useMarketSummary(wlSymbols, "crypto");
  // Crypto news: use Alpaca Benzinga feed filtered to BTC.
  const news = useNews("BTC", 8);
  const [wlInput, setWlInput] = useState("");
  const [adding, setAdding] = useState(false);

  async function submitAddWatchlist(e: { preventDefault(): void }) {
    e.preventDefault();
    const v = wlInput.trim().toUpperCase();
    if (!v || adding) return;
    if (wlSymbols.includes(v)) {
      showToast(`${v} is already on your watchlist`, "info");
      return;
    }
    setAdding(true);
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
      onError: (err: unknown) => {
        setAdding(false);
        showToast(`Couldn't add ${v}: ${(err as Error).message}`, "error");
      },
    });
  }

  function removeWatchlistSymbol(sym: string) {
    removeFromWatchlist.mutate(sym, {
      onSuccess: () => showToast(`${sym} removed from watchlist`, "info"),
      onError: (err: unknown) =>
        showToast(`Couldn't remove ${sym}: ${(err as Error).message}`, "error"),
    });
  }

  // Filter positions to crypto only for allocation/balance cards.
  const cryptoPositions = (positions.data?.positions || []).filter(
    (p: Position) => p.asset_class === "crypto" || p.symbol.includes("/"),
  );
  const invested = cryptoPositions.reduce((s: number, p: Position) => s + p.market_value, 0);
  const unrealized = cryptoPositions.reduce((s: number, p: Position) => s + p.unrealized_pl, 0);
  const totalCostBasis = cryptoPositions.reduce((s: number, p: Position) => s + p.cost_basis, 0);
  const unrealizedPct = totalCostBasis > 0 ? unrealized / totalCostBasis : 0;
  const dayPl = cryptoPositions.reduce(
    (s: number, p: Position) => s + p.unrealized_intraday_pl,
    0,
  );
  const dayBasis = invested - dayPl;
  const dayPlPct = dayBasis > 0 ? dayPl / dayBasis : 0;

  const quotes: Record<string, Snapshot> = {};
  (snaps.data?.snapshots || []).forEach((s: Snapshot) => {
    quotes[s.symbol] = s;
  });

  return (
    <div className="max-w-[1280px] mx-auto pt-2">
      {/* Live crypto price strip — replaces the equity indices ticker. */}
      {tickers.data && <CryptoTicker tickers={tickers.data.tickers} />}

      {/* Hero row */}
      <div className="grid gap-4 mb-6 grid-cols-1 lg:grid-cols-[1.4fr_1fr]">
        <BalanceCard
          account={account.data}
          title="Crypto"
          value={invested}
          dayPl={dayPl}
          dayPlPct={dayPlPct}
          unrealized={unrealized}
          unrealizedPct={unrealizedPct}
          buyingPower={account.data?.non_marginable_buying_power ?? 0}
        />
        <AllocationCard positions={cryptoPositions} />
      </div>

      {/* AI crypto summary — auto-generated per 6-hour UTC window, dismissible */}
      <MarketSummaryCard
        cache={marketSummary.cache}
        isGenerating={marketSummary.isGenerating}
        windowLabel={marketSummary.windowLabel}
        onDismiss={marketSummary.dismiss}
      />

      {/* Crypto Watchlist */}
      <SectionHeading
        label="Watchlist"
        ctx={
          watchlist.isPending
            ? "loading…"
            : `${wlSymbols.length} pair${wlSymbols.length === 1 ? "" : "s"}`
        }
        ctxRight={
          <form
            onSubmit={submitAddWatchlist}
            className="inline-flex items-center gap-1"
          >
            <input
              value={wlInput}
              onChange={(e) => setWlInput(e.target.value.toUpperCase())}
              placeholder="+ BTC/USD"
              aria-label="Add crypto pair to watchlist"
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
          {Array.from({ length: 4 }).map((_, i) => (
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
          Your crypto watchlist is empty. Type a pair above (e.g. BTC/USD) to add one.
        </div>
      ) : (
        <CardsRow>
          {wlSymbols.map((sym: string) => {
            const q = quotes[sym];
            const last = q?.last_price ?? 0;
            const dayChange =
              q?.prev_close && q?.last_price
                ? (q.last_price - q.prev_close) / q.prev_close
                : 0;
            const pos = cryptoPositions.find((p: Position) => p.symbol === sym);
            return (
              <SparkCard
                key={sym}
                symbol={coinLabel(sym)}
                name={pos ? `${pos.qty} units` : ""}
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

      {/* Crypto news via Alpaca/Benzinga BTC feed */}
      <SectionHeading label="News" ctx="crypto headlines" />
      {news.error && <ErrorBanner message={news.error.message} />}
      {!news.data && !news.error && <NewsCardSkeleton />}
      {news.data && news.data.news.length > 0 && (
        <NewsCard
          articles={news.data.news.map((n: NewsItem) => ({
            title: n.headline,
            link: n.url,
            summary: n.summary,
            source: n.source,
            pub_time: n.time,
          }))}
        />
      )}
      {news.data && news.data.news.length === 0 && (
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
    </div>
  );
}
