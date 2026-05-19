import { useAsset } from "../data/hooks";
import ErrorBanner from "./ErrorBanner";
import Pill from "./Pill";

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="flex justify-between py-1 text-[13px]">
      <span className="text-muted">{label}</span>
      <span className="text-xs text-muted">{on ? "✓" : "—"}</span>
    </div>
  );
}

export default function InstrumentInfo({ symbol }: { symbol: string }) {
  const { data: a, error, isPending } = useAsset(symbol);

  return (
    <div className="bg-panel border border-border rounded-lg p-3">
      <h2 className="text-[13px] uppercase tracking-wide text-muted m-0 mb-2">Instrument</h2>
      {!symbol && <div className="text-xs text-muted">Select a symbol</div>}
      {symbol && error && <ErrorBanner message={error.message} />}
      {symbol && !error && isPending && <div className="text-xs text-muted">Loading…</div>}
      {a && (
        <>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">{a.symbol}</span>
            <span className="tabular-nums">{a.name}</span>
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Exchange</span>
            <span className="text-xs text-muted">{a.exchange}</span>
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Class</span>
            <Pill status={a.asset_class} tone="neutral" />
          </div>
          <div className="flex justify-between py-1 text-[13px]">
            <span className="text-muted">Status</span>
            <Pill status={a.status} tone="neutral" />
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
