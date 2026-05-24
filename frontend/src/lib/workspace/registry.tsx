import { createContext, useContext } from "react";
import type { IDockviewPanelProps } from "dockview-react";
import Positions from "../../components/Positions";
import Orders from "../../components/Orders";
import Activities from "../../components/Activities";
import TVPlatform from "../../components/TVPlatform";
import { NewsCard, NewsCardSkeleton } from "../../components/discover/NewsCard";
import ErrorBanner from "../../components/ErrorBanner";
import { useMarketNews, useNews } from "../../data/hooks";

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
      <TVPlatform
        symbol={symbol || fallback}
        onSymbolChange={setSymbol}
        assetClass={assetClass}
      />
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

// id → React component, consumed by DockviewReact's `components` map.
export const WIDGET_COMPONENTS: Record<
  string,
  React.FunctionComponent<IDockviewPanelProps>
> = {
  chart: ChartWidget,
  positions: PositionsWidget,
  orders: OrdersWidget,
  activity: ActivityWidget,
  news: NewsWidget,
};

// Drives the "add widget" menu and panel titles.
export const WIDGET_CATALOG: { id: string; title: string }[] = [
  { id: "chart", title: "Chart" },
  { id: "positions", title: "Positions" },
  { id: "orders", title: "Orders" },
  { id: "activity", title: "Activity" },
  { id: "news", title: "News" },
];

export const WIDGET_TITLES: Record<string, string> = Object.fromEntries(
  WIDGET_CATALOG.map((w) => [w.id, w.title]),
);
