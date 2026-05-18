import { useEffect, useState } from "react";
import { useConfig } from "./data/hooks";
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
  const { data: cfg, isError } = useConfig();
  const symbols =
    cfg?.symbols ?? (isError ? ["AAPL", "MSFT", "TSLA", "SPY"] : []);
  const meta = cfg ? { feed: cfg.feed, paper: cfg.paper } : null;
  const [selected, setSelected] = useState<string>("");

  useEffect(() => {
    if (!selected && symbols.length) setSelected(symbols[0]);
  }, [symbols.join(","), selected]);

  return (
    <div className="app">
      <header>
        <h1>Trading Platform</h1>
        {meta && (
          <span className="tag">
            {meta.paper ? "PAPER" : "LIVE"} · {meta.feed.toUpperCase()} feed
          </span>
        )}
      </header>
      <div className="grid">
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          <AccountSummary />
          <AssetSearch onSelect={setSelected} />
          <Watchlist
            symbols={symbols}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {selected && <PriceChart symbol={selected} />}
          <OrderTicket symbol={selected} onSymbolChange={setSelected} />
        </div>
      </div>
      <div className="panels-extra">
        <MarketClock />
        <PortfolioSummary />
        <Positions />
        <Orders />
        <Activities />
      </div>
    </div>
  );
}
