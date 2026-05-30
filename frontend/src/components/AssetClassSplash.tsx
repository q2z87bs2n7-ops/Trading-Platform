import { useState } from "react";
import { useAccount, useClock, useFxcmAccount, useFxcmPositions, usePositions } from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import { isCryptoPosition } from "../lib/asset-class";
import { computeCfdExposure } from "../lib/fxcm-exposure";
import { DASH, money, moneyOr, pct } from "../lib/format";

type AssetClassMode = "stocks" | "crypto" | "cfd";

const CFD_COLOR = "oklch(72% 0.18 55)";

const timeHM = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

type Seg = { label: string; value: number; color: string; badge?: string };

// Shared allocation bar + legend. Segments with value ≤ 0 are dropped.
function Bar({ segs }: { segs: Seg[] }) {
  const shown = segs.filter((s) => s.value > 0);
  const total = shown.reduce((a, s) => a + s.value, 0) || 1;
  return (
    <div className="flex flex-col gap-2">
      <div
        className="flex h-2.5 w-full overflow-hidden rounded-full"
        style={{ background: "var(--panel-2)", gap: 2 }}
      >
        {shown.map((s) => (
          <div
            key={s.label}
            style={{
              width: `${(s.value / total) * 100}%`,
              background: s.color,
              minWidth: 2,
              transition: "width .4s cubic-bezier(.4,0,.2,1)",
            }}
          />
        ))}
      </div>
      <div className="flex gap-x-4 gap-y-2 flex-wrap text-[12px]">
        {shown.map((s) => (
          <span key={s.label} className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{ background: s.color }} />
            <span style={{ color: "var(--text-2)" }}>{s.label}</span>
            <span className="tabular-nums" style={{ color: "var(--mute)" }}>
              {money(s.value)} · {Math.round((s.value / total) * 100)}%
            </span>
            {s.badge && (
              <span
                className="tabular-nums font-semibold"
                style={{
                  fontSize: 10.5,
                  padding: "1px 6px",
                  borderRadius: 999,
                  background: "oklch(72% 0.18 55 / 0.18)",
                  color: CFD_COLOR,
                }}
              >
                {s.badge}
              </span>
            )}
          </span>
        ))}
      </div>
    </div>
  );
}

// Two-axis top module: Capital (equity) ⇄ Exposure (notional). The CFD slice
// swaps equity→notional between modes and carries the leverage badge.
function TwoAxisModule({
  capital,
  exposure,
}: {
  capital: Seg[];
  exposure: Seg[];
}) {
  const [mode, setMode] = useState<"capital" | "exposure">("capital");
  const segs = mode === "capital" ? capital : exposure;
  const total = segs.filter((s) => s.value > 0).reduce((a, s) => a + s.value, 0);
  const Tab = ({ k, label }: { k: "capital" | "exposure"; label: string }) => (
    <button
      type="button"
      onClick={() => setMode(k)}
      aria-pressed={mode === k}
      className="cursor-pointer border-0 tabular-nums"
      style={{
        padding: "4px 11px",
        borderRadius: 999,
        fontSize: 11.5,
        fontWeight: mode === k ? 600 : 400,
        background: mode === k ? "var(--text)" : "transparent",
        color: mode === k ? "var(--bg)" : "var(--mute)",
      }}
    >
      {label}
    </button>
  );
  return (
    <div
      className="w-full rounded-card-lg p-6 flex flex-col gap-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-start justify-between gap-4">
        <div className="flex flex-col gap-1">
          <span
            className="text-[11px] uppercase"
            style={{ color: "var(--mute)", letterSpacing: "0.06em" }}
          >
            {mode === "capital" ? "Capital deployed" : "Market exposure"}
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ fontSize: "clamp(26px, 4vw, 34px)", lineHeight: 1 }}
          >
            {money(total)}
          </span>
        </div>
        <div
          className="inline-flex"
          style={{
            background: "var(--panel-2)",
            border: "1px solid var(--border)",
            borderRadius: 999,
            padding: 2,
            gap: 2,
          }}
        >
          <Tab k="capital" label="Capital" />
          <Tab k="exposure" label="Exposure" />
        </div>
      </div>
      <Bar segs={segs} />
    </div>
  );
}

function GroupLabel({ title, value }: { title: string; value: string }) {
  return (
    <div
      className="flex items-center gap-2 px-1 mb-2 mt-1 text-[11.5px] uppercase"
      style={{ color: "var(--mute)", letterSpacing: "0.07em" }}
    >
      <span>{title}</span>
      <span className="flex-1 h-px" style={{ background: "var(--border)" }} />
      <span className="tabular-nums">{value}</span>
    </div>
  );
}

function DayChip({ value, pctValue, ready }: { value: number; pctValue: number; ready: boolean }) {
  if (!ready) return <span className="text-[12px]" style={{ color: "var(--mute)" }}>Day {DASH}</span>;
  const up = value >= 0;
  return (
    <span
      className="text-[12px] tabular-nums font-medium"
      style={{ color: up ? "var(--pos)" : "var(--neg)" }}
    >
      {up ? "+" : ""}
      {money(value)} · {pct(pctValue)}
    </span>
  );
}

export default function AssetClassSplash({
  onSelect,
  onSelectScalp,
  onClose,
  currentClass,
}: {
  onSelect: (cls: AssetClassMode) => void;
  // Enter the CFD silo straight into Scalp mode. Desktop-only surface, so the
  // affordance is hidden on mobile.
  onSelectScalp?: () => void;
  onClose?: () => void;
  currentClass?: AssetClassMode;
}) {
  const isMobile = useMobile();
  const account = useAccount();
  const positions = usePositions();
  const clock = useClock();

  // Fetch-once here (poll=false): the overview paints live-on-open but doesn't
  // keep polling the bridge while the splash/Hub lingers. Bridge offline → 503
  // with retry:0, so the card stays on DASH rather than reading $0.00.
  const fxcmAccount = useFxcmAccount(true, false);
  const fxcmPositions = useFxcmPositions(true, false);

  const a = account.data;
  const all = positions.data?.positions ?? [];
  const stockPos = all.filter((p) => !isCryptoPosition(p));
  const cryptoPos = all.filter(isCryptoPosition);
  const stockMV = stockPos.reduce((s, p) => s + p.market_value, 0);
  const cryptoMV = cryptoPos.reduce((s, p) => s + p.market_value, 0);

  // Alpaca cash; negative = margin debit (L), which attributes wholly to stocks
  // since crypto is non-marginable. On the Capital axis the loan nets out of the
  // stock slice (equity, not market value); on Exposure stocks show gross MV.
  const cash = a?.cash ?? 0;
  const L = Math.max(-cash, 0);
  const cashPos = Math.max(cash, 0);
  const alpacaEquity = a?.equity ?? 0;
  const alpacaDay = a ? a.equity - a.equity_at_market_open : 0;
  const alpacaDayPct = a && a.equity_at_market_open > 0 ? alpacaDay / a.equity_at_market_open : 0;

  const fx = fxcmAccount.data;
  const fxcmEquity = fx?.equity ?? 0;
  const fxcmUsed = fx?.usedmargin ?? 0;
  const fxcmFree = fx?.usablemargin ?? 0;
  const fxcmDay = fx?.day_pl ?? 0;
  const fxcmDayPct = fxcmEquity - fxcmDay > 0 ? fxcmDay / (fxcmEquity - fxcmDay) : 0;
  const exposure = computeCfdExposure(fxcmPositions.data ?? []);

  const alpacaReady = !!a && !!positions.data;
  const fxcmReady = !!fx;
  const levBadge = exposure.leverage > 0 ? `⚡${Math.round(exposure.leverage)}×` : undefined;

  const capitalSegs: Seg[] = [
    { label: "Stocks", value: stockMV - L, color: "var(--pos)" },
    { label: "Crypto", value: cryptoMV, color: "var(--accent)" },
    { label: "Cash", value: cashPos, color: "var(--mute)" },
    { label: "CFD", value: fxcmEquity, color: CFD_COLOR, badge: levBadge },
  ];
  const exposureSegs: Seg[] = [
    { label: "Stocks", value: stockMV, color: "var(--pos)" },
    { label: "Crypto", value: cryptoMV, color: "var(--accent)" },
    { label: "CFD", value: exposure.exposureUsd, color: CFD_COLOR, badge: levBadge },
  ];

  const alpacaAlloc: Seg[] = [
    { label: "Stocks", value: stockMV, color: "var(--pos)" },
    { label: "Crypto", value: cryptoMV, color: "var(--accent)" },
    { label: "Cash", value: cashPos, color: "var(--mute)" },
  ];

  const clk = clock.data;
  const stockSub = clk
    ? clk.is_open
      ? `Open until ${timeHM(clk.next_close)}`
      : `Closed · opens ${timeHM(clk.next_open)}`
    : "Market hours";

  const cardStyle = {
    background: "var(--panel)",
    border: "1px solid var(--border)",
    borderRadius: "var(--r)",
    boxShadow: "var(--shadow-sm)",
  } as const;

  // A clickable row inside the Alpaca card (silo navigation).
  const EnterRow = ({ dot, label, onClick }: { dot: string; label: string; onClick: () => void }) => (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 w-full text-left cursor-pointer border-0 bg-transparent transition-colors"
      style={{ padding: "9px 4px", borderTop: "1px solid var(--border)" }}
      onMouseEnter={(e: { currentTarget: HTMLButtonElement }) => {
        e.currentTarget.style.background = "var(--panel-2)";
      }}
      onMouseLeave={(e: { currentTarget: HTMLButtonElement }) => {
        e.currentTarget.style.background = "transparent";
      }}
    >
      <span style={{ width: 8, height: 8, borderRadius: 99, background: dot }} />
      <span className="text-[13.5px] flex-1" style={{ color: "var(--text)" }}>{label}</span>
      <span style={{ color: "var(--mute)" }}>→</span>
    </button>
  );

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6 overflow-auto"
      style={{ background: "var(--bg)" }}
    >
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          aria-label="Close account overview"
          className="absolute top-4 right-4 w-9 h-9 flex items-center justify-center rounded-card cursor-pointer border-0 text-[18px]"
          style={{ background: "var(--panel)", border: "1px solid var(--border)", color: "var(--text-2)" }}
        >
          ✕
        </button>
      )}
      <div className="flex flex-col items-center gap-7 w-full max-w-2xl py-8">
        {/* Brand + eyebrow + heading */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-card text-white font-bold text-xl mb-1"
            style={{ background: "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)" }}
            aria-hidden
          >
            ◆
          </div>
          <span
            className="text-[10.5px] font-semibold uppercase tabular-nums"
            style={{ color: "var(--mute)", letterSpacing: "0.12em" }}
          >
            Paper trading
          </span>
          <h1 className="text-[26px] font-semibold" style={{ letterSpacing: "-0.02em", color: "var(--text)" }}>
            {onClose ? "Your account" : "Pick a market to step into."}
          </h1>
        </div>

        {/* Two-axis module — hub overlay only (keeps the first-time picker focused). */}
        {onClose &&
          (alpacaReady ? (
            <TwoAxisModule capital={capitalSegs} exposure={exposureSegs} />
          ) : (
            <div className="w-full rounded-card-lg animate-pulse" style={{ ...cardStyle, minHeight: 140 }} />
          ))}

        <div className="flex flex-col w-full">
          {/* Brokerage · Alpaca — stocks + crypto, one shared cash pool. */}
          <GroupLabel title="Brokerage · Alpaca" value={moneyOr(alpacaEquity, alpacaReady)} />
          <div className="w-full flex flex-col gap-4" style={{ ...cardStyle, padding: "18px 22px" }}>
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <span style={{ width: 8, height: 8, borderRadius: 99, background: "var(--pos)" }} />
                <span className="text-[14px] font-semibold">Stocks &amp; Crypto</span>
              </div>
              <div className="flex flex-col items-end">
                <span className="font-mono font-semibold tabular-nums text-[18px]">
                  {moneyOr(alpacaEquity, alpacaReady)}
                </span>
                <DayChip value={alpacaDay} pctValue={alpacaDayPct} ready={alpacaReady} />
              </div>
            </div>
            {alpacaReady && <Bar segs={alpacaAlloc} />}
            <div>
              <EnterRow dot="var(--pos)" label="Stocks" onClick={() => onSelect("stocks")} />
              <EnterRow dot="var(--accent)" label="Crypto" onClick={() => onSelect("crypto")} />
            </div>
            <span className="text-[11.5px]" style={{ color: "var(--mute)" }}>{stockSub}</span>
          </div>

          {/* Brokerage · FXCM — isolated cash, leveraged. Whole card enters CFD;
              the ⚡ Scalp corner jumps to the rapid-trade surface (desktop only). */}
          <div className="mt-4">
            <GroupLabel title="Brokerage · FXCM" value={moneyOr(fxcmEquity, fxcmReady)} />
          </div>
          <div className="relative" style={{ minWidth: 0 }}>
            <button
              type="button"
              onClick={() => onSelect("cfd")}
              className="w-full flex flex-col gap-4 text-left cursor-pointer border-0 transition-colors"
              style={{
                ...cardStyle,
                padding: "18px 22px",
                borderColor: currentClass === "cfd" ? "var(--border-2)" : "var(--border)",
              }}
              onMouseEnter={(e: { currentTarget: HTMLButtonElement }) => {
                e.currentTarget.style.borderColor = "var(--border-2)";
              }}
              onMouseLeave={(e: { currentTarget: HTMLButtonElement }) => {
                e.currentTarget.style.borderColor =
                  currentClass === "cfd" ? "var(--border-2)" : "var(--border)";
              }}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: CFD_COLOR }} />
                  <span className="text-[14px] font-semibold">Forex &amp; CFDs</span>
                </div>
                <div className="flex flex-col items-end">
                  <span className="font-mono font-semibold tabular-nums text-[18px]">
                    {moneyOr(fxcmEquity, fxcmReady)}
                  </span>
                  <DayChip value={fxcmDay} pctValue={fxcmDayPct} ready={fxcmReady} />
                </div>
              </div>

              {/* Margin-used gauge (decoupled from exposure). */}
              <div className="flex flex-col gap-1.5">
                <div className="flex justify-between text-[12px]">
                  <span style={{ color: "var(--mute)" }}>Margin used</span>
                  <span className="tabular-nums" style={{ color: "var(--mute)" }}>
                    {fxcmReady ? (
                      <>
                        <span style={{ color: CFD_COLOR }}>{money(fxcmUsed)}</span> of {money(fxcmEquity)} ·{" "}
                        {fxcmEquity > 0 ? Math.round((fxcmUsed / fxcmEquity) * 100) : 0}%
                      </>
                    ) : (
                      DASH
                    )}
                  </span>
                </div>
                <div className="h-2 rounded-full overflow-hidden" style={{ background: "var(--panel-2)" }}>
                  <div
                    style={{
                      height: "100%",
                      width: `${fxcmEquity > 0 ? Math.min((fxcmUsed / fxcmEquity) * 100, 100) : 0}%`,
                      background: CFD_COLOR,
                    }}
                  />
                </div>
              </div>

              <div className="grid grid-cols-3 gap-2.5">
                {[
                  { k: "Free margin", v: moneyOr(fxcmFree, fxcmReady) },
                  { k: "Exposure", v: fxcmReady ? money(exposure.exposureUsd) : DASH },
                  { k: "Leverage", v: fxcmReady ? (levBadge ? `${Math.round(exposure.leverage)}×` : "—") : DASH, lev: true },
                ].map((s) => (
                  <div key={s.k} className="rounded-card" style={{ background: "var(--panel-2)", padding: "9px 10px" }}>
                    <div className="text-[10.5px] uppercase" style={{ color: "var(--mute)", letterSpacing: "0.04em" }}>
                      {s.k}
                    </div>
                    <div
                      className="font-mono font-semibold tabular-nums text-[14.5px] mt-0.5"
                      style={s.lev ? { color: CFD_COLOR } : undefined}
                    >
                      {s.v}
                    </div>
                  </div>
                ))}
              </div>
            </button>
            {onSelectScalp && !isMobile && (
              <button
                type="button"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectScalp();
                }}
                className="absolute top-3 right-3 cursor-pointer transition-colors"
                style={{
                  background: "oklch(72% 0.18 55 / 0.14)",
                  color: "oklch(58% 0.16 55)",
                  border: "1px solid oklch(72% 0.18 55 / 0.45)",
                  borderRadius: 999,
                  padding: "4px 11px",
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                ⚡ Scalp
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
