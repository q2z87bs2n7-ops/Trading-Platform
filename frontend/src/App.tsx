import { useEffect, useState } from "react";
import {
  useAddToWatchlist,
  useConfig,
  useRemoveFromWatchlist,
  useWatchlist,
} from "./data/hooks";
import AssetSearch from "./components/AssetSearch";
import OrderTicket from "./components/OrderTicket";
import Watchlist from "./components/Watchlist";
import PriceChart from "./components/PriceChart";
import Positions from "./components/Positions";
import Orders from "./components/Orders";
import Activities from "./components/Activities";
import TopBar from "./components/TopBar";
import Tools from "./components/Tools";
import TVPlatform from "./components/TVPlatform";

type PlatformMode = "trading" | "tv" | "discover";

export default function App() {
  const { data: cfg } = useConfig();
  const { data: wl } = useWatchlist();
  const symbols = wl?.symbols ?? [];
  const meta = cfg ? { feed: cfg.feed, paper: cfg.paper } : null;
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const [selected, setSelected] = useState<string>("");
  const [mode, setMode] = useState<PlatformMode>(
    // Persist the user's last choice across page reloads; default to discover
    () => (localStorage.getItem("platform_mode") as PlatformMode) ?? "discover",
  );

  useEffect(() => {
    if (!selected && symbols.length) setSelected(symbols[0]);
  }, [symbols.join(","), selected]);

  function switchMode(m: PlatformMode) {
    setMode(m);
    localStorage.setItem("platform_mode", m);
  }

  return (
    <div className="app">
      <header>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h1>Trading Platform</h1>
            <span className="text-xs text-muted">
              v{__APP_VERSION__}
              {meta && ` · ${meta.paper ? "PAPER" : "LIVE"} · ${meta.feed.toUpperCase()} feed`}
            </span>
          </div>
          {/* Platform mode toggle */}
          <div style={{ display: "flex", gap: 4 }}>
            <button
              className={`btn btn-mini${mode === "discover" ? " active" : ""}`}
              style={{ opacity: mode === "discover" ? 1 : 0.5 }}
              onClick={() => switchMode("discover")}
              type="button"
            >
              Discover
            </button>
            <button
              className={`btn btn-mini${mode === "trading" ? " active" : ""}`}
              style={{ opacity: mode === "trading" ? 1 : 0.5 }}
              onClick={() => switchMode("trading")}
              type="button"
            >
              Trading
            </button>
            <button
              className={`btn btn-mini${mode === "tv" ? " active" : ""}`}
              style={{ opacity: mode === "tv" ? 1 : 0.5 }}
              onClick={() => switchMode("tv")}
              type="button"
            >
              TradingView
            </button>
          </div>
        </div>
        {/* Status ribbon — trading mode only (UI-04) */}
        {mode === "trading" && <TopBar />}
      </header>
      {/* Discover — movers, most-active, news. Hides TopBar like TV mode. */}
      {mode === "discover" && <Tools selected={selected} onSelect={setSelected} />}

      {/* TradingView full terminal — shown when TV mode is active */}
      {mode === "tv" && <TVPlatform symbol={selected} />}

      {/* Trading UI — shown when Trading mode is active */}
      {mode === "trading" && (
        <>
          {/* Workspace: watchlist left, chart centre, order ticket right. */}
          <div className="grid">
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <AssetSearch
                onSelect={setSelected}
                onAdd={(s) => addToWatchlist.mutate(s)}
              />
              <Watchlist
                symbols={symbols}
                selected={selected}
                onSelect={setSelected}
                onRemove={(s) => removeFromWatchlist.mutate(s)}
              />
            </div>
            <div>
              <PriceChart symbol={selected} />
            </div>
            <div>
              <OrderTicket symbol={selected} onSymbolChange={setSelected} />
            </div>
          </div>

          {/* Blotter: full-width tables so columns have room to breathe. */}
          <div className="blotter">
            <Positions />
            <Orders />
          </div>

          {/* Account activity feed under the blotter. News was moved
             out into the Tools tab. */}
          <div className="mt-4">
            <Activities />
          </div>
        </>
      )}
    </div>
  );
}
