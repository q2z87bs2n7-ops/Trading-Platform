import { useAccount, useClock, usePositions } from "../data/hooks";
import { useMobile } from "../hooks/useMobile";
import { isCryptoPosition } from "../lib/asset-class";
import { money, pct } from "../lib/format";

type AssetClassMode = "stocks" | "crypto";

const timeHM = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });

// Calm silo summary card. Whole card is the affordance (1px border, no inner
// "Enter" CTA, no outer ring). Reads as a list row, not a Stripe billboard.
function SiloCard({
  name,
  dot,
  positions,
  equity,
  dayPl,
  dayPlPct,
  subStatus,
  active,
  onClick,
}: {
  name: string;
  dot: string;
  positions: number;
  equity: number;
  dayPl: number;
  dayPlPct: number;
  subStatus: string;
  active?: boolean;
  onClick: () => void;
}) {
  const dayUp = dayPl >= 0;
  const sign = dayUp ? "+" : "";
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-2 text-left cursor-pointer border-0 w-full transition-colors"
      style={{
        background: "var(--panel)",
        border: `1px solid ${active ? "var(--border-2)" : "var(--border)"}`,
        borderRadius: "var(--r)",
        boxShadow: "var(--shadow-sm)",
        padding: "18px 22px",
        minWidth: 0,
      }}
      onMouseEnter={(e: { currentTarget: HTMLButtonElement }) => {
        e.currentTarget.style.borderColor = "var(--border-2)";
      }}
      onMouseLeave={(e: { currentTarget: HTMLButtonElement }) => {
        e.currentTarget.style.borderColor = active
          ? "var(--border-2)"
          : "var(--border)";
      }}
    >
      <div className="flex items-center gap-2">
        <span
          aria-hidden
          className="inline-block"
          style={{ width: 6, height: 6, borderRadius: 99, background: dot }}
        />
        <span className="text-[14px] font-semibold" style={{ color: "var(--text)" }}>
          {name}
        </span>
        <span className="text-[10.5px] tabular-nums" style={{ color: "var(--mute)" }}>
          {positions} position{positions === 1 ? "" : "s"}
        </span>
      </div>
      <div
        className="font-mono font-semibold tabular-nums"
        style={{ fontSize: 24, lineHeight: 1, letterSpacing: "-0.02em" }}
      >
        {money(equity)}
      </div>
      <div className="text-[11.5px] tabular-nums" style={{ color: "var(--mute)" }}>
        <span style={{ color: dayUp ? "var(--pos)" : "var(--neg)", fontWeight: 600 }}>
          Day {sign}
          {pct(dayPlPct)}
        </span>
        {" · "}
        {subStatus}
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
  const positions = usePositions();
  const clock = useClock();

  const all = positions.data?.positions ?? [];
  const stockPos = all.filter((p) => !isCryptoPosition(p));
  const cryptoPos = all.filter(isCryptoPosition);
  const stockEquity = stockPos.reduce((s, p) => s + p.market_value, 0);
  const cryptoEquity = cryptoPos.reduce((s, p) => s + p.market_value, 0);
  const stockDay = stockPos.reduce((s, p) => s + p.unrealized_intraday_pl, 0);
  const cryptoDay = cryptoPos.reduce((s, p) => s + p.unrealized_intraday_pl, 0);
  const stockDayPct =
    stockEquity - stockDay > 0 ? stockDay / (stockEquity - stockDay) : 0;
  const cryptoDayPct =
    cryptoEquity - cryptoDay > 0 ? cryptoDay / (cryptoEquity - cryptoDay) : 0;

  const clk = clock.data;
  const stockSub = clk
    ? clk.is_open
      ? `Open until ${timeHM(clk.next_close)}`
      : `Closed · opens ${timeHM(clk.next_open)}`
    : "Market hours";

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
        {/* Brand + eyebrow + heading */}
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
          <span
            className="text-[10.5px] font-semibold uppercase tabular-nums"
            style={{ color: "var(--mute)", letterSpacing: "0.12em" }}
          >
            Paper trading
          </span>
          <h1
            className="text-[26px] font-semibold"
            style={{ letterSpacing: "-0.02em", color: "var(--text)" }}
          >
            {onClose ? "Your account" : "Pick a market to step into."}
          </h1>
        </div>

        {/* Global account overview (only shown as the hub overlay, not on the
            first-time landing — keeps the picker focused). */}
        {onClose && <AccountOverview />}

        {/* Silo summary cards — whole card is the affordance, no inner CTA. */}
        <div
          className={`grid w-full gap-${isMobile ? "2.5" : "[18px]"} ${
            isMobile ? "grid-cols-1" : "grid-cols-2"
          }`}
          style={isMobile ? undefined : { gap: 18 }}
        >
          <SiloCard
            name="Stocks"
            dot="var(--pos)"
            positions={stockPos.length}
            equity={stockEquity}
            dayPl={stockDay}
            dayPlPct={stockDayPct}
            subStatus={stockSub}
            active={currentClass === "stocks"}
            onClick={() => onSelect("stocks")}
          />
          <SiloCard
            name="Crypto"
            dot="var(--accent)"
            positions={cryptoPos.length}
            equity={cryptoEquity}
            dayPl={cryptoDay}
            dayPlPct={cryptoDayPct}
            subStatus="24/7"
            active={currentClass === "crypto"}
            onClick={() => onSelect("crypto")}
          />
        </div>

      </div>
    </div>
  );
}
