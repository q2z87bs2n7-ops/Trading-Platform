import { useAsset } from "../data/hooks";

// Alpaca passes enums through as strings like "AssetClass.US_EQUITY";
// show just the readable tail.
const clean = (s: string) =>
  s.split(".").pop()!.replace(/_/g, " ").toLowerCase();

function Flag({ label, on }: { label: string; on: boolean }) {
  return (
    <div className="row">
      <span className="label">{label}</span>
      <span
        className="tag"
        style={{ color: on ? "var(--green)" : "var(--red)" }}
      >
        {on ? "yes" : "no"}
      </span>
    </div>
  );
}

export default function InstrumentInfo({ symbol }: { symbol: string }) {
  const { data: a, error, isPending } = useAsset(symbol);

  return (
    <div className="panel">
      <h2>Instrument</h2>
      {!symbol && <div className="tag">Select a symbol</div>}
      {symbol && error && <div className="error">{error.message}</div>}
      {symbol && !error && isPending && <div className="tag">Loading…</div>}
      {a && (
        <>
          <div className="row">
            <span className="label">{a.symbol}</span>
            <span className="price">{a.name}</span>
          </div>
          <div className="row">
            <span className="label">Exchange</span>
            <span className="tag">{a.exchange}</span>
          </div>
          <div className="row">
            <span className="label">Class</span>
            <span className="tag">{clean(a.asset_class)}</span>
          </div>
          <div className="row">
            <span className="label">Status</span>
            <span
              className="tag"
              style={{
                color:
                  clean(a.status) === "active"
                    ? "var(--green)"
                    : "var(--red)",
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
