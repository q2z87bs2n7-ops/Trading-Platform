import PriceChart from "../PriceChart";

export function ChartCard({ symbol }: { symbol: string }) {
  return (
    <div
      className="mt-6 p-[20px_24px]"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r-lg)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {symbol ? (
        <PriceChart symbol={symbol} />
      ) : (
        <div
          className="grid place-items-center text-[13px]"
          style={{ color: "var(--mute)", height: 280 }}
        >
          Pick a symbol to chart it.
        </div>
      )}
    </div>
  );
}
