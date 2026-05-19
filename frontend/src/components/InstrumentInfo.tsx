import { useAsset } from "../data/hooks";

// Alpaca passes enums through as strings like "AssetClass.US_EQUITY";
// show just the readable tail.
const clean = (s: string) =>
  s.split(".").pop()!.replace(/_/g, " ").toLowerCase();

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex justify-between py-1.5 text-[14px]">
      <span className="text-muted">{label}</span>
      <span
        className="text-xs text-muted"
        style={{ color: on ? "var(--pos)" : "var(--neg)" }}
      >
        {on ? "yes" : "no"}
      </span>
    </div>
  );
}

export default function InstrumentInfo({ symbol }: { symbol: string }) {
  const { data: a, error, isPending } = useAsset(symbol);

  return (
    <div className="bg-panel border border-border rounded-lg p-4">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-3">Instrument</h2>
      {!symbol && <div className="text-xs text-muted">Select a symbol</div>}
      {symbol && error && <div className="text-red text-[13px]">{error.message}</div>}
      {symbol && !error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {a && (
        <>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">{a.symbol}</span>
            <span className="tabular-nums">{a.name}</span>
          </div>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Exchange</span>
            <span className="text-xs text-muted">{a.exchange}</span>
          </div>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Class</span>
            <span className="text-xs text-muted">{clean(a.asset_class)}</span>
          </div>
          <div className="flex justify-between py-1.5 text-[14px]">
            <span className="text-muted">Status</span>
            <span
              className="text-xs text-muted"
              style={{
                color:
                  clean(a.status) === "active"
                    ? "var(--pos)"
                    : "var(--neg)",
              }}
            >
              {clean(a.status)}
            </span>
          </div>
          <Flag label="Tradable" on={a.tradable} />
          <Flag label="Marginable" on={a.marginable} />
          <Flag label="Shortable" on={a.shortable} />
          <Flag label="Fractionable" on={a.fractionable} />
        </>
      )}
    </div>
  );
}
