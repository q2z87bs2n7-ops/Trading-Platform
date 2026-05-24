import { createContext, useContext, useState } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import Positions from "../../components/Positions";
import Orders from "../../components/Orders";
import Activities from "../../components/Activities";
import TVChartWidget from "../../components/TVChartWidget";
import OrderSheet from "../../components/trade/OrderSheet";
import { NewsCard, NewsCardSkeleton } from "../../components/discover/NewsCard";
import ErrorBanner from "../../components/ErrorBanner";
import { useMarketNews, useNews } from "../../data/hooks";
import { useLiveQuotes } from "../../data/useLiveQuotes";
import { money, fmtCryptoPrice } from "../../lib/format";

export type AssetClass = "stocks" | "crypto";

// Live, non-serialized state shared by every widget in the canvas. Kept in
// React context (not Dockview panel params) so the persisted layout JSON stays
// a clean list of widget ids — the symbol/silo are runtime concerns.
interface WorkspaceCtx {
  symbol: string;
  setSymbol: (s: string) => void;
  assetClass: AssetClass;
}

const WorkspaceContext = createContext<WorkspaceCtx | null>(null);
export const WorkspaceProvider = WorkspaceContext.Provider;

export function useWorkspace(): WorkspaceCtx {
  const ctx = useContext(WorkspaceContext);
  if (!ctx) throw new Error("useWorkspace must be used within a WorkspaceProvider");
  return ctx;
}

// Fills a Dockview panel and lets the embedded surface scroll independently.
function Pane({ children, pad }: { children: React.ReactNode; pad?: boolean }) {
  return (
    <div style={{ height: "100%", overflow: "auto", padding: pad ? 12 : 0 }}>
      {children}
    </div>
  );
}

function ChartWidget(_props: IDockviewPanelProps) {
  const { symbol, setSymbol, assetClass } = useWorkspace();
  const fallback = assetClass === "crypto" ? "BTC/USD" : "AAPL";
  return (
    <div style={{ height: "100%" }}>
      <TVChartWidget symbol={symbol || fallback} onSymbolChange={setSymbol} />
    </div>
  );
}

function PositionsWidget(_props: IDockviewPanelProps) {
  const { setSymbol, assetClass } = useWorkspace();
  return (
    <Pane pad>
      <Positions variant="strip" onSelect={setSymbol} assetClass={assetClass} />
    </Pane>
  );
}

function OrdersWidget(_props: IDockviewPanelProps) {
  const { assetClass } = useWorkspace();
  return (
    <Pane pad>
      <Orders assetClass={assetClass} />
    </Pane>
  );
}

function ActivityWidget(_props: IDockviewPanelProps) {
  return (
    <Pane pad>
      <Activities bare />
    </Pane>
  );
}

function NewsWidget(_props: IDockviewPanelProps) {
  const { assetClass } = useWorkspace();
  const isCrypto = assetClass === "crypto";
  const stock = useMarketNews(12, !isCrypto);
  const crypto = useNews("BTC", 12, isCrypto);

  if (isCrypto) {
    return (
      <Pane pad>
        {crypto.error && <ErrorBanner message={crypto.error.message} />}
        {!crypto.data && !crypto.error && <NewsCardSkeleton />}
        {crypto.data && (
          <NewsCard
            articles={crypto.data.news.map((n) => ({
              title: n.headline,
              link: n.url,
              summary: n.summary,
              source: n.source,
              pub_time: n.time,
            }))}
          />
        )}
      </Pane>
    );
  }
  return (
    <Pane pad>
      {stock.error && <ErrorBanner message={stock.error.message} />}
      {!stock.data && !stock.error && <NewsCardSkeleton />}
      {stock.data && <NewsCard articles={stock.data.articles} />}
    </Pane>
  );
}

// Compact order-entry panel: linked symbol + live quote + Buy/Sell. Reuses the
// full OrderSheet ticket (and useOrderTicket inside it) rather than rebuilding
// the form — same pattern as the floating TradeBar.
function TradeWidget(_props: IDockviewPanelProps) {
  const { symbol, assetClass } = useWorkspace();
  const sym = (
    symbol || (assetClass === "crypto" ? "BTC/USD" : "AAPL")
  ).toUpperCase();
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const { quotes } = useLiveQuotes([sym]);
  const quote = quotes[sym];
  const fmt = assetClass === "crypto" ? fmtCryptoPrice : money;

  function openSheet(s: "buy" | "sell") {
    setSide(s);
    setOpen(true);
  }

  return (
    <Pane pad>
      <div className="flex flex-col gap-3">
        <div className="flex items-baseline justify-between">
          <span className="text-[15px] font-semibold">{sym}</span>
          {quote && (
            <span
              className="font-mono text-[13px] tabular-nums"
              style={{ color: "var(--text-2)" }}
            >
              {fmt(quote.mid)}
            </span>
          )}
        </div>
        <div className="grid gap-2" style={{ gridTemplateColumns: "1fr 1fr" }}>
          {(["buy", "sell"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => openSheet(s)}
              className="text-[14px] font-semibold cursor-pointer border-0 capitalize"
              style={{
                padding: "12px 16px",
                borderRadius: "var(--r)",
                background: s === "buy" ? "var(--pos)" : "var(--neg)",
                color: "white",
              }}
            >
              {s}
            </button>
          ))}
        </div>
        <span className="text-[11px]" style={{ color: "var(--mute)" }}>
          Opens the full order ticket.
        </span>
      </div>
      <OrderSheet
        open={open}
        symbol={sym}
        defaultSide={side}
        onClose={() => setOpen(false)}
      />
    </Pane>
  );
}

// id → React component, consumed by DockviewReact's `components` map.
export const WIDGET_COMPONENTS: Record<
  string,
  React.FunctionComponent<IDockviewPanelProps>
> = {
  chart: ChartWidget,
  trade: TradeWidget,
  positions: PositionsWidget,
  orders: OrdersWidget,
  activity: ActivityWidget,
  news: NewsWidget,
};

// Drives the "add widget" menu and panel titles.
export const WIDGET_CATALOG: { id: string; title: string }[] = [
  { id: "chart", title: "Chart" },
  { id: "trade", title: "Trade" },
  { id: "positions", title: "Positions" },
  { id: "orders", title: "Orders" },
  { id: "activity", title: "Activity" },
  { id: "news", title: "News" },
];

export const WIDGET_TITLES: Record<string, string> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.id, w.title]),
);
