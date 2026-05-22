type AssetClassMode = "stocks" | "crypto";

function Card({
  title,
  subtitle,
  detail,
  accent,
  onClick,
}: {
  title: string;
  subtitle: string;
  detail: string;
  accent: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex flex-col gap-3 p-8 text-left cursor-pointer transition-all border-0 w-full"
      style={{
        background: "var(--panel)",
        border: `1.5px solid var(--border)`,
        borderRadius: "var(--r-xl)",
        boxShadow: "var(--shadow-sm)",
      }}
      onMouseEnter={(e: { currentTarget: HTMLButtonElement }) => {
        e.currentTarget.style.borderColor = accent;
        e.currentTarget.style.boxShadow = `0 0 0 3px ${accent}22`;
      }}
      onMouseLeave={(e: { currentTarget: HTMLButtonElement }) => {
        e.currentTarget.style.borderColor = "var(--border)";
        e.currentTarget.style.boxShadow = "var(--shadow-sm)";
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

export default function AssetClassSplash({
  onSelect,
}: {
  onSelect: (cls: AssetClassMode) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-6"
      style={{ background: "var(--bg)" }}
    >
      <div className="flex flex-col items-center gap-10 w-full max-w-2xl">
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
            Choose your market to get started
          </p>
        </div>

        {/* Market cards */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 w-full">
          <Card
            title="$"
            subtitle="Stocks"
            detail="NYSE · NASDAQ · ARCA · 9,000+ equities · Market hours"
            accent="var(--pos)"
            onClick={() => onSelect("stocks")}
          />
          <Card
            title="B"
            subtitle="Crypto"
            detail="BTC · ETH · SOL · XRP · DOGE · 24/7 trading"
            accent="var(--accent)"
            onClick={() => onSelect("crypto")}
          />
        </div>

        <p className="text-[12px]" style={{ color: "var(--mute)" }}>
          Paper trading only · Alpaca · You can switch markets anytime from the header
        </p>
      </div>
    </div>
  );
}
