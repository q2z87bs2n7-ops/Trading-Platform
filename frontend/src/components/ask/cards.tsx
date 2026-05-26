import type { AiAskMessage, AiAskResponse } from "../../api";
import type { AssetClass, Intent } from "../../lib/ask-intent";
import { ChartCard } from "./cards/ChartCard";
import { CloseCard } from "./cards/CloseCard";
import { FallbackOrAiCard } from "./cards/FallbackCard";
import { MarketSummaryIntentCard } from "./cards/MarketSummaryCard";
import { MoversCard } from "./cards/MoversCard";
import { NewsCard } from "./cards/NewsCard";
import { OrderCard } from "./cards/OrderCard";
import { OrdersCard } from "./cards/OrdersCard";
import { PortfolioCard } from "./cards/PortfolioCard";
import { WorkspaceCard } from "./cards/WorkspaceCard";

export function AskResult({
  intent,
  assetClass,
  history = [],
  cachedResp,
  onClose,
  onOpenInWorkspace,
  onResolved,
}: {
  intent: Intent;
  assetClass: AssetClass;
  history?: AiAskMessage[];
  cachedResp?: AiAskResponse;
  onClose: () => void;
  onOpenInWorkspace: (symbol: string) => void;
  onResolved?: (resp: AiAskResponse) => void;
}) {
  switch (intent.type) {
    case "order":
      return (
        <OrderCard
          side={intent.side}
          qty={intent.qty}
          symbol={intent.symbol}
          price={intent.price}
          otype={intent.otype}
          onDone={onClose}
        />
      );
    case "close":
      return <CloseCard symbol={intent.symbol} onDone={onClose} />;
    case "portfolio":
      return <PortfolioCard assetClass={assetClass} />;
    case "movers":
      return <MoversCard kind={intent.kind} assetClass={assetClass} />;
    case "news":
      return <NewsCard symbol={intent.symbol} assetClass={assetClass} />;
    case "orders":
      return <OrdersCard assetClass={assetClass} />;
    case "chart":
      return (
        <ChartCard
          symbol={intent.symbol}
          onOpenInWorkspace={() => onOpenInWorkspace(intent.symbol)}
        />
      );
    case "market_summary":
      return <MarketSummaryIntentCard assetClass={assetClass} />;
    case "workspace":
      return <WorkspaceCard actions={intent.actions} />;
    case "fallback":
      return (
        <FallbackOrAiCard
          text={intent.text}
          assetClass={assetClass}
          history={history}
          cachedResp={cachedResp}
          onResolved={onResolved}
        />
      );
  }
}
