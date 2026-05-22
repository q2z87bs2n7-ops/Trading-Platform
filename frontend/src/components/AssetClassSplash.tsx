import { useAccount, usePositions } from "../data/hooks";
import { money, pct } from "../lib/format";
import type { Position } from "../types";

type AssetClassMode = "stocks" | "crypto";

const isCrypto = (p: Position) =>
  p.asset_class === "crypto" || p.symbol.includes("/");

function Card({
  title,
  subtitle,
  detail,
  accent,
  active,
  onClick,
}: {
  title: string;
  subtitle: string;
  detail: string;
  accent: string;
  active?: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-3 p-8 text-left cursor-pointer transition-all border-0 w-full"
      style={{
        background: "var(--panel)",
        border: `1.5px solid ${active ? accent : "var(--border)"}`,
        borderRadius: "var(--r-xl)",
        boxShadow: active ? `0 0 0 3px ${accent}22` : "var(--shadow-sm)",
      }}
      onMouseEnter={(e: { currentTarget: HTMLButtonElement }) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}22`;
      }}
      onMouseLeave={(e: { currentTarget: HTMLButtonElement }) => {
        e.currentTarget.style.borderColor = active ? accent : "var(--border)";
        e.currentTarget.style.boxShadow = active
          ? `0 0 0 3px ${accent}22`
          : "var(--shadow-sm)";
      }}
    >
      <div
        className="text-[28px] font-bold tabular-nums"
        style={{ color: accent }}
      >
        {title}
      </div>
      <div className="text-[18px] font-semibold" style={{ color: "var(--text)" }}>
        {subtitle}
      </div>
      <div className="text-[13px]" style={{ color: "var(--mute)" }}>
        {detail}
      </div>
      <div
        className="mt-2 text-[13px] font-semibold px-4 py-2 rounded-card self-start"
        style={{ background: accent, color: "white" }}
      >
        Enter {subtitle}
      </div>
    </button>
  );
}

// Whole-account snapshot, independent of the active silo: total equity,
// day P/L, free cash + buying power, and how the equity splits across
// stocks / crypto / cash.
function AccountOverview() {
  const account = useAccount();
  const positions = usePositions();
  const a = account.data;

  if (!a) {
    return (
      <div
        className="w-full rounded-card-lg p-6 animate-pulse"
        style={{
          background: "var(--panel)",
          border: "1px solid var(--border)",
          boxShadow: "var(--shadow-sm)",
          minHeight: 150,
        }}
      />
    );
  }

  const all = positions.data?.positions || [];
  const cryptoVal = all
    .filter(isCrypto)
    .reduce((s, p) => s + p.market_value, 0);
  const stockVal = all
    .filter((p) => !isCrypto(p))
    .reduce((s, p) => s + p.market_value, 0);
  const cash = Math.max(a.cash, 0);
  const total = stockVal + cryptoVal + cash || 1;

  const dayPl = a.equity - a.equity_at_market_open;
  const dayPlPct =
    a.equity_at_market_open > 0 ? dayPl / a.equity_at_market_open : 0;
  const dayUp = dayPl >= 0;

  const segments = [
    { label: "Stocks", value: stockVal, color: "var(--pos)" },
    { label: "Crypto", value: cryptoVal, color: "var(--accent)" },
    { label: "Cash", value: cash, color: "var(--mute)" },
  ].filter((s) => s.value > 0);

  return (
    <div
      className="w-full rounded-card-lg p-6 flex flex-col gap-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div className="flex flex-col gap-1">
          <span className="text-[12px]" style={{ color: "var(--mute)" }}>
            Total account value
          </span>
          <span
            className="font-semibold tabular-nums"
            style={{ fontSize: "clamp(28px, 4vw, 38px)", lineHeight: 1 }}
          >
            {money(a.equity)}
          </span>
        </div>
        <span
          className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded text-[12.5px] font-medium tabular-nums"
          style={{
            background: dayUp ? "var(--pos-bg)" : "var(--neg-bg)",
            color: dayUp ? "var(--pos)" : "var(--neg)",
          }}
        >
          {dayUp ? "↑" : "↓"} {dayUp ? "+" : ""}
          {money(dayPl)} ({pct(dayPlPct)}) today
        </span>
      </div>

      {/* Allocation bar */}
      <div className="flex flex-col gap-2">
        <div
          className="flex h-2.5 w-full overflow-hidden rounded-full"
          style={{ background: "var(--panel-2)" }}
        >
          {segments.map((s) => (
            <div
              key={s.label}
              style={{ width: `${(s.value / total) * 100}%`, background: s.color }}
            />
          ))}
        </div>
        <div className="flex gap-4 flex-wrap text-[12px]">
          {segments.map((s) => (
            <span key={s.label} className="flex items-center gap-1.5">
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: s.color }}
              />
              <span style={{ color: "var(--text-2)" }}>{s.label}</span>
              <span className="tabular-nums" style={{ color: "var(--mute)" }}>
                {money(s.value)} · {((s.value / total) * 100).toFixed(0)}%
              </span>
            </span>
          ))}
        </div>
      </div>

      <div className="flex gap-8 flex-wrap">
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Cash
          </small>
          <strong className="font-medium text-[15px] tabular-nums">
            {money(a.cash)}
          </strong>
        </div>
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Buying power (margin)
          </small>
          <strong className="font-medium text-[15px] tabular-nums">
            {money(a.buying_power)}
          </strong>
        </div>
        <div className="flex flex-col">
          <small className="text-[12px]" style={{ color: "var(--mute)" }}>
            Crypto buying power
          </small>
          <strong className="font-medium text-[15px] tabular-nums">
            {money(a.non_marginable_buying_power)}
          </strong>
        </div>
      </div>
    </div>
  );
}

export default function AssetClassSplash({
  onSelect,
  onClose,
  currentClass,
}: {
  onSelect: (cls: AssetClassMode) => void;
  onClose?: () => void;
  currentClass?: AssetClassMode;
}) {
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
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            color: "var(--text-2)",
          }}
        >
          ✕
        </button>
      )}
      <div className="flex flex-col items-center gap-8 w-full max-w-2xl py-8">
        {/* Brand */}
        <div className="flex flex-col items-center gap-2 text-center">
          <div
            className="flex items-center justify-center w-12 h-12 rounded-card text-white font-bold text-xl mb-1"
            style={{
              background:
                "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
            }}
            aria-hidden
          >
            ◆
          </div>
          <h1
            className="text-[26px] font-bold"
            style={{ letterSpacing: "-0.02em", color: "var(--text)" }}
          >
            Trading Platform
          </h1>
          <p className="text-[15px]" style={{ color: "var(--mute)" }}>
            {onClose ? "Your account at a glance" : "Choose your market to get started"}
          </p>
        </div>

        {/* Global account overview */}
        <AccountOverview />

        {/* Market cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          <Card
            title="$"
            subtitle="Stocks"
            detail="NYSE · NASDAQ · ARCA · 9,000+ equities · Market hours"
            accent="var(--pos)"
            active={currentClass === "stocks"}
            onClick={() => onSelect("stocks")}
          />
          <Card
            title="₿"
            subtitle="Crypto"
            detail="BTC · ETH · SOL · XRP · DOGE · 24/7 trading"
            accent="var(--accent)"
            active={currentClass === "crypto"}
            onClick={() => onSelect("crypto")}
          />
        </div>
      </div>
    </div>
  );
}
