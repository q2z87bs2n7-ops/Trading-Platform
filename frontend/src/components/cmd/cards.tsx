import type { Intent } from "../../lib/cmd-intent";
import { ChartCard } from "./cards/ChartCard";
import { CloseCard } from "./cards/CloseCard";
import { FallbackOrAiCard } from "./cards/FallbackCard";
import { MoversCard } from "./cards/MoversCard";
import { NewsCard } from "./cards/NewsCard";
import { OrderCard } from "./cards/OrderCard";
import { OrdersCard } from "./cards/OrdersCard";
import { PortfolioCard } from "./cards/PortfolioCard";

export function CmdResult({
  intent,
  onClose,
  onOpenInWorkspace,
}: {
  intent: Intent;
  onClose: () => void;
  onOpenInWorkspace: (symbol: string) => void;
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
      return <PortfolioCard />;
    case "movers":
      return <MoversCard kind={intent.kind} />;
    case "news":
      return <NewsCard symbol={intent.symbol} />;
    case "orders":
      return <OrdersCard />;
    case "chart":
      return (
        <ChartCard
          symbol={intent.symbol}
          onOpenInWorkspace={() => onOpenInWorkspace(intent.symbol)}
        />
      );
    case "fallback":
      return <FallbackOrAiCard text={intent.text} />;
  }
}
