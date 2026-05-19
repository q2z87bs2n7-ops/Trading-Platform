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
import InstrumentInfo from "./components/InstrumentInfo";
import Positions from "./components/Positions";
import Orders from "./components/Orders";
import Activities from "./components/Activities";
import News from "./components/News";
import TopBar from "./components/TopBar";
import TVPlatform from "./components/TVPlatform";

type PlatformMode = "custom" | "tv";

export default function App() {
  const { data: cfg } = useConfig();
  const { data: wl } = useWatchlist();
  const symbols = wl?.symbols ?? [];
  const meta = cfg ? { feed: cfg.feed, paper: cfg.paper } : null;
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const [selected, setSelected] = useState<string>("");
  const [mode, setMode] = useState<PlatformMode>(
    // Persist the user's last choice across page reloads
    () => (localStorage.getItem("platform_mode") as PlatformMode) ?? "custom",
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
              className={`btn btn-mini${mode === "custom" ? " active" : ""}`}
              style={{ opacity: mode === "custom" ? 1 : 0.5 }}
              onClick={() => switchMode("custom")}
              type="button"
            >
              Our Platform
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
        {/* Status ribbon — custom mode only (UI-04) */}
        {mode === "custom" && <TopBar />}
      </header>
      {/* TradingView full terminal — shown when TV mode is active */}
      {mode === "tv" && <TVPlatform symbol={selected} />}

      {/* Custom UI — shown when Our Platform mode is active */}
      {mode === "custom" && (
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
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <InstrumentInfo symbol={selected} />
              {selected && <PriceChart symbol={selected} />}
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

          {/* Supporting panels: news + activity log. */}
          <div className="panels-extra">
            <News symbol={selected} />
            <Activities />
          </div>
        </>
      )}
    </div>
  );
}
