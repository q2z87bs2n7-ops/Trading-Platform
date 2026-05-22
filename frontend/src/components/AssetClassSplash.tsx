import { useAccount, usePositions } from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import { isCryptoPosition } from "../lib/asset-class";
import { money, pct } from "../lib/format";

type AssetClassMode = "stocks" | "crypto";

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

// Compact horizontal market pill — mobile alternative to the big glyph
// cards so both markets sit above the fold.
function MarketPill({
  glyph,
  name,
  detail,
  accent,
  active,
  onClick,
}: {
  glyph: string;
  name: string;
  detail: string;
  accent: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full text-left cursor-pointer"
      style={{
        background: "var(--panel)",
        border: `1.5px solid ${active ? accent : "var(--border)"}`,
        borderRadius: 14,
        padding: 14,
        boxShadow: active ? `0 0 0 3px ${accent}22` : "var(--shadow-sm)",
        display: "grid",
        gridTemplateColumns: "44px 1fr auto",
        gap: 12,
        alignItems: "center",
        minHeight: "var(--mob-tap)",
      }}
    >
      <span
        aria-hidden
        style={{
          width: 44,
          height: 44,
          borderRadius: 12,
          display: "grid",
          placeItems: "center",
          fontSize: 22,
          fontWeight: 700,
          background: `${accent}1a`,
          color: accent,
        }}
      >
        {glyph}
      </span>
      <span style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
        <span style={{ fontSize: 16, fontWeight: 600 }}>{name}</span>
        <span style={{ fontSize: 11.5, color: "var(--mute)" }}>{detail}</span>
      </span>
      <span style={{ color: accent, fontWeight: 600, fontSize: 18 }}>→</span>
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
    .filter(isCryptoPosition)
    .reduce((s, p) => s + p.market_value, 0);
  const stockVal = all
    .filter((p) => !isCryptoPosition(p))
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

      <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
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
            Stocks buying power
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
  const isMobile = useMobile();
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

        {/* Market cards — big glyph cards on desktop, compact pills on mobile */}
        {isMobile ? (
          <div className="flex flex-col gap-2.5 w-full">
            <MarketPill
              glyph="$"
              name="Stocks"
              detail="9,000+ equities · Market hours"
              accent="var(--pos)"
              active={currentClass === "stocks"}
              onClick={() => onSelect("stocks")}
            />
            <MarketPill
              glyph="₿"
              name="Crypto"
              detail="BTC · ETH · SOL · 24/7 trading"
              accent="var(--accent)"
              active={currentClass === "crypto"}
              onClick={() => onSelect("crypto")}
            />
          </div>
        ) : (
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
        )}
      </div>
    </div>
  );
}
