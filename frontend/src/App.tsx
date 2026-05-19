import { useEffect, useState } from "react";
import {
  useAddToWatchlist,
  useConfig,
  useRemoveFromWatchlist,
  useWatchlist,
} from "./data/hooks";
import AccountSummary from "./components/AccountSummary";
import AssetSearch from "./components/AssetSearch";
import OrderTicket from "./components/OrderTicket";
import Watchlist from "./components/Watchlist";
import PriceChart from "./components/PriceChart";
import Positions from "./components/Positions";
import PortfolioSummary from "./components/PortfolioSummary";
import Orders from "./components/Orders";
import Activities from "./components/Activities";
import MarketClock from "./components/MarketClock";

export default function App() {
  const { data: cfg } = useConfig();
  const { data: wl } = useWatchlist();
  const symbols = wl?.symbols ?? [];
  const meta = cfg ? { feed: cfg.feed, paper: cfg.paper } : null;
  const addToWatchlist = useAddToWatchlist();
  const removeFromWatchlist = useRemoveFromWatchlist();
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!selected && symbols.length) setSelected(symbols[0]);
  }, [symbols.join(","), selected]);

  return (
    <div className="app">
      <header>
        <h1>Trading Platform</h1>
        <span className="tag">
          v{__APP_VERSION__}
          {meta && ` · ${meta.paper ? "PAPER" : "LIVE"} · ${meta.feed.toUpperCase()} feed`}
        </span>
      </header>
      {/* Context strip: market + account status, glanceable. */}
      <div className="panels-extra">
        <MarketClock />
        <AccountSummary />
        <PortfolioSummary />
      </div>

      {/* Workspace: pick instruments on the left, analyse + trade centre. */}
      <div className="grid" style={{ marginTop: 16 }}>
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
          {selected && <PriceChart symbol={selected} />}
          <OrderTicket symbol={selected} onSymbolChange={setSelected} />
        </div>
      </div>

      {/* Blotter: holdings, orders and history — reviewed after the fact. */}
      <div className="panels-extra">
        <Positions />
        <Orders />
        <Activities />
      </div>
    </div>
  );
}
