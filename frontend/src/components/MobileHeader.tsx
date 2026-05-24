import IconButton from "./IconButton";

type Mode = "discover" | "portfolio" | "chart";
type AssetClass = "stocks" | "crypto";

const TITLES: Record<Mode, string> = {
  discover: "Discover",
  portfolio: "Portfolio",
  chart: "Chart",
};

interface Props {
  mode: Mode;
  activeClass: AssetClass;
  onOpenDrawer: () => void;
  onOpenCmd: () => void;
  onSwitchMode: (m: Mode) => void;
  onSwitchAssetClass: (m: AssetClass) => void;
}

export default function MobileHeader({
  mode,
  activeClass,
  onOpenDrawer,
  onOpenCmd,
  onSwitchMode,
  onSwitchAssetClass,
}: Props) {
  return (
    <div
      style={{
        position: "sticky",
        top: "var(--safe-top)",
        zIndex: 30,
        background: "var(--bg)",
      }}
    >
      {/* Row 1 — chrome */}
      <div
        style={{
          height: "var(--mob-chrome-top)",
          padding: "0 var(--mob-container-pad)",
          display: "flex",
          alignItems: "center",
          gap: 10,
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        <IconButton
          onClick={onOpenDrawer}
          aria-label="Open menu"
          className="w-9 h-9 justify-center text-[18px]"
        >
          ☰
        </IconButton>

        <div style={{ flex: 1, minWidth: 0, lineHeight: 1.1 }}>
          <div style={{ fontSize: 15.5, fontWeight: 600, letterSpacing: "-0.005em" }}>
            {TITLES[mode]}
          </div>
          <div
            style={{ fontSize: 11, color: "var(--mute)", fontFamily: "var(--font-mono)" }}
          >
            {activeClass === "crypto" ? "Crypto" : "Stocks"} · v{__APP_VERSION__}
          </div>
        </div>

        <IconButton
          onClick={onOpenCmd}
          aria-label="Ask anything"
          className="w-9 h-9 justify-center text-[16px]"
          style={{
            background: "var(--accent-bg)",
            color: "var(--accent)",
            borderColor: "var(--accent)",
          }}
        >
          ✦
        </IconButton>
      </div>

      {/* Row 2 — mode pills + asset toggle */}
      <div
        style={{
          height: "var(--mob-chrome-top-2)",
          padding: "0 var(--mob-container-pad)",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderBottom: "1px solid var(--hairline)",
        }}
      >
        {(["discover", "chart", "portfolio"] as Mode[]).map((m) => {
          const active = m === mode;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onSwitchMode(m)}
              style={{
                fontSize: 12.5,
                fontWeight: 600,
                padding: "6px 12px",
                borderRadius: 999,
                border: "1px solid " + (active ? "var(--border)" : "transparent"),
                background: active ? "var(--panel)" : "transparent",
                color: active ? "var(--text)" : "var(--text-2)",
                textTransform: "capitalize",
                cursor: "pointer",
              }}
            >
              {m}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto" }}>
          <AssetClassToggleInline value={activeClass} onChange={onSwitchAssetClass} />
        </div>
      </div>
    </div>
  );
}

// Compact toggle matching the desktop AssetClassToggle look but smaller.
function AssetClassToggleInline({
  value,
  onChange,
}: {
  value: AssetClass;
  onChange: (m: AssetClass) => void;
}) {
  return (
    <div
      style={{
        display: "inline-flex",
        padding: 2,
        borderRadius: 9,
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
      }}
    >
      {(["stocks", "crypto"] as AssetClass[]).map((m) => {
        const active = m === value;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            style={{
              fontSize: 10.5,
              fontWeight: 600,
              padding: "4px 8px",
              borderRadius: 7,
              background: active
                ? m === "stocks"
                  ? "var(--pos)"
                  : "var(--accent)"
                : "transparent",
              color: active ? "white" : "var(--text-2)",
              border: 0,
              cursor: "pointer",
              textTransform: "capitalize",
            }}
          >
            {m === "stocks" ? "Stx" : "Crypto"}
          </button>
        );
      })}
    </div>
  );
}
