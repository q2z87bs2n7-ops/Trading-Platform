import { useEffect, useState } from "react";
import { getConfig } from "./api";
import AccountSummary from "./components/AccountSummary";
import Watchlist from "./components/Watchlist";
import PriceChart from "./components/PriceChart";
import Positions from "./components/Positions";
import PortfolioSummary from "./components/PortfolioSummary";
import Orders from "./components/Orders";
import Activities from "./components/Activities";
import MarketClock from "./components/MarketClock";

export default function App() {
  const [symbols, setSymbols] = useState<string[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [meta, setMeta] = useState<{ feed: string; paper: boolean } | null>(null);

  useEffect(() => {
    getConfig()
      .then((c) => {
        setSymbols(c.symbols);
        setSelected(c.symbols[0] ?? "");
        setMeta({ feed: c.feed, paper: c.paper });
      })
      .catch(() => {
        const fallback = ["AAPL", "MSFT", "TSLA", "SPY"];
        setSymbols(fallback);
        setSelected(fallback[0]);
      });
  }, []);

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
          <Watchlist
            symbols={symbols}
            selected={selected}
            onSelect={setSelected}
          />
        </div>
        {selected && <PriceChart symbol={selected} />}
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
