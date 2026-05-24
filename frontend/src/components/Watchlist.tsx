import {
  useAddToCryptoWatchlist,
  useAddToWatchlist,
  useCryptoWatchlist,
  useRemoveFromCryptoWatchlist,
  useRemoveFromWatchlist,
  useSnapshots,
  useWatchlist,
} from "../data/hooks";
import { useLiveQuotes } from "../data/useLiveQuotes";
import type { Snapshot } from "../types";
import { AssetSearch } from "./AssetSearch";
import { SparkCard, SparkCardSkeleton } from "./discover/SparkCard";
import { coinLabel } from "./discover/util";

const GRID = "repeat(auto-fill, minmax(150px, 1fr))";

/**
 * Silo watchlist — live spark cards over `/api/watchlist`, with add (AssetSearch)
 * and hover-remove. Location-agnostic: takes `assetClass`, the active `selected`
 * symbol for highlighting, and an `onSelect` for clicks. Reuses the Discover
 * SparkCard + watchlist hooks.
 */
export default function Watchlist({
  assetClass,
  selected,
  onSelect,
}: {
  assetClass: "stocks" | "crypto";
  selected?: string;
  onSelect: (symbol: string) => void;
}) {
  const isCrypto = assetClass === "crypto";
  const stockWl = useWatchlist();
  const cryptoWl = useCryptoWatchlist();
  const wl = isCrypto ? cryptoWl : stockWl;
  const symbols = wl.data?.symbols ?? [];

  const addStock = useAddToWatchlist();
  const removeStock = useRemoveFromWatchlist();
  const addCrypto = useAddToCryptoWatchlist();
  const removeCrypto = useRemoveFromCryptoWatchlist();
  const add = isCrypto ? addCrypto : addStock;
  const remove = isCrypto ? removeCrypto : removeStock;

  const snaps = useSnapshots(symbols);
  const { quotes: live } = useLiveQuotes(symbols);
  const snapMap: Record<string, Snapshot> = {};
  for (const s of snaps.data?.snapshots ?? []) snapMap[s.symbol] = s;

  return (
    <div className="flex flex-col gap-2">
      <AssetSearch
        assetClass={isCrypto ? "crypto" : "us_equity"}
        align="left"
        fluid
        disabled={add.isPending}
        onChoose={(v) => add.mutate(v, { onSuccess: () => onSelect(v) })}
      />

      {wl.isPending ? (
        <div className="grid gap-2" style={{ gridTemplateColumns: GRID }}>
          {Array.from({ length: 6 }).map((_, i) => (
            <SparkCardSkeleton key={i} />
          ))}
        </div>
      ) : symbols.length === 0 ? (
        <div className="text-[12px] p-2" style={{ color: "var(--mute)" }}>
          {isCrypto
            ? "No pairs. Add one above (e.g. BTC/USD)."
            : "No symbols. Add one above."}
        </div>
      ) : (
        <div className="grid gap-2" style={{ gridTemplateColumns: GRID }}>
          {symbols.map((sym) => {
            const snap = snapMap[sym];
            const price = live[sym]?.mid ?? snap?.last_price ?? 0;
            const prev = snap?.prev_close ?? 0;
            const changePct = prev ? (price - prev) / prev : 0;
            return (
              <SparkCard
                key={sym}
                symbol={isCrypto ? coinLabel(sym) : sym}
                name=""
                price={price}
                changePct={changePct}
                selected={sym === selected}
                onSelect={() => onSelect(sym)}
                onRemove={() => remove.mutate(sym)}
                isCrypto={isCrypto}
              />
            );
          })}
        </div>
      )}
    </div>
  );
}
