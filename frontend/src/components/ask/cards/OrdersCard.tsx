import { useOrders } from "../../../data/hooks";
import type { AssetClass } from "../../../lib/ask-intent";
import { isCryptoOrder } from "../../../lib/asset-class";
import AskResultCard from "../AskResultCard";

export function OrdersCard({ assetClass }: { assetClass: AssetClass }) {
  const orders = useOrders("open", 50);
  const all = orders.data?.orders || [];
  const rows = all.filter((o) =>
    assetClass === "crypto" ? isCryptoOrder(o) : !isCryptoOrder(o),
  );
  const label = assetClass === "crypto" ? "crypto" : "stock";
  if (!orders.data) {
    return (
      <AskResultCard title="Open orders">
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          {orders.error ? orders.error.message : "Loading…"}
        </div>
      </AskResultCard>
    );
  }
  return (
    <AskResultCard title="Open orders" meta={`${rows.length} working`}>
      {rows.length === 0 ? (
        <div className="text-[13px]" style={{ color: "var(--mute)" }}>
          No working {label} orders. Recent fills appear in the blotter.
        </div>
      ) : (
        <div className="flex flex-col">
          <div
            className="grid gap-2 text-[11px] uppercase pb-1.5"
            style={{
              gridTemplateColumns: "60px 50px 1fr 1fr 1fr 1fr",
              color: "var(--mute)",
              borderBottom: "1px solid var(--hairline)",
            }}
          >
            <span>Sym</span>
            <span>Side</span>
            <span className="text-right">Type</span>
            <span className="text-right">Qty</span>
            <span className="text-right">Limit</span>
            <span className="text-right">Stop</span>
          </div>
          {rows.slice(0, 10).map((o) => {
            const sideKey = o.side.split(".").pop()!.toLowerCase();
            const buy = sideKey === "buy";
            const typeKey = o.type.split(".").pop()!.toLowerCase();
            return (
              <div
                key={o.id}
                className="grid gap-2 py-1.5 text-[13px] items-center"
                style={{
                  gridTemplateColumns: "60px 50px 1fr 1fr 1fr 1fr",
                  borderBottom: "1px solid var(--hairline)",
                }}
              >
                <span className="font-semibold">{o.symbol}</span>
                <span
                  className="font-mono text-[10px] uppercase px-1.5 py-0.5 inline-block w-fit"
                  style={{
                    background: buy ? "var(--pos-bg)" : "var(--neg-bg)",
                    color: buy ? "var(--pos)" : "var(--neg)",
                    borderRadius: 4,
                  }}
                >
                  {sideKey}
                </span>
                <span
                  className="font-mono tabular-nums text-right"
                  style={{ color: "var(--text-2)" }}
                >
                  {typeKey}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {o.qty ?? (o.filled_qty || "—")}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {o.limit_price ?? "—"}
                </span>
                <span className="font-mono tabular-nums text-right">
                  {o.stop_price ?? "—"}
                </span>
              </div>
            );
          })}
        </div>
      )}
    </AskResultCard>
  );
}
