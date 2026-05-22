import { useEffect, useState } from "react";
import { useConfig, useCryptoWatchlist, useWatchlist } from "./data/hooks";
import { useTheme } from "./hooks/useTheme";
import Positions from "./components/Positions";
import Orders from "./components/Orders";
import Activities from "./components/Activities";
import TopBar from "./components/TopBar";
import Tools from "./components/Tools";
import CryptoTools from "./components/CryptoTools";
import AssetClassSplash from "./components/AssetClassSplash";
import PortfolioHero from "./components/PortfolioHero";
import SectionHeading from "./components/SectionHeading";
import TVPlatform from "./components/TVPlatform";
import ChatPanel from "./components/chat/ChatPanel";
import TradeBar from "./components/trade/TradeBar";
import CmdBar from "./components/cmd/CmdBar";
import SettingsMenu from "./components/SettingsMenu";
import Toaster from "./components/Toaster";
import IconButton from "./components/IconButton";

type PlatformMode = "discover" | "portfolio" | "chart";
type AssetClassMode = "stocks" | "crypto";

function readAssetClassMode(): AssetClassMode | null {
  const raw = localStorage.getItem("asset_class_mode");
  if (raw === "stocks" || raw === "crypto") return raw;
  return null;
}

function readPlatformMode(): PlatformMode {
  const raw = localStorage.getItem("platform_mode");
  // Calm v2 mode renames: trading → portfolio, chartbot → chart (and the
  // pre-ChartBot legacy "tv" value collapses straight to chart).
  if (raw === "trading") {
    localStorage.setItem("platform_mode", "portfolio");
    return "portfolio";
  }
  if (raw === "chartbot" || raw === "tv") {
    localStorage.setItem("platform_mode", "chart");
    return "chart";
  }
  if (raw === "discover" || raw === "portfolio" || raw === "chart") return raw;
  return "discover";
}

const MODES: { value: PlatformMode; label: string }[] = [
  { value: "discover", label: "Discover" },
  { value: "portfolio", label: "Portfolio" },
  { value: "chart", label: "Chart" },
];

function BrandMark() {
  return (
    <div
      className="flex items-center justify-center w-8 h-8 rounded-card text-panel font-bold text-sm"
      style={{
        background:
          "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
      }}
      aria-hidden
    >
      ◆
    </div>
  );
}

function AssetClassToggle({
  mode,
  onChange,
}: {
  mode: AssetClassMode;
  onChange: (m: AssetClassMode) => void;
}) {
  return (
    <div
      className="inline-flex items-center gap-0.5 p-0.5 rounded-card"
      style={{ background: "var(--panel-2)", border: "1px solid var(--border)" }}
    >
      {(["stocks", "crypto"] as AssetClassMode[]).map((m) => (
        <button
          key={m}
          type="button"
          onClick={() => onChange(m)}
          className="text-[11px] font-semibold px-2.5 py-1 rounded-card transition-colors border-0 cursor-pointer capitalize"
          style={{
            background: mode === m ? "var(--accent)" : "transparent",
            color: mode === m ? "white" : "var(--text-2)",
          }}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function ModePill({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[13px] font-medium px-3 py-1.5 rounded-card transition-colors bg-transparent border-0 cursor-pointer"
      style={{
        color: active ? "var(--text)" : "var(--text-2)",
        background: active ? "var(--panel)" : "transparent",
        boxShadow: active ? "var(--shadow-sm)" : "none",
      }}
    >
      {children}
    </button>
  );
}

function AskPill({ onClick }: { onClick: () => void }) {
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  return (
    <IconButton onClick={onClick} className="text-[13px] px-3 py-1.5">
      <span style={{ color: "var(--accent)" }} aria-hidden>
        ✦
      </span>
      <span>Ask anything</span>
      <span
        className="font-mono text-[11px] px-1.5 py-0.5 rounded"
        style={{
          border: "1px solid var(--border)",
          color: "var(--mute)",
        }}
      >
        {isMac ? "⌘K" : "Ctrl K"}
      </span>
    </IconButton>
  );
}

function ThemeToggle({
  theme,
  onToggle,
}: {
  theme: "light" | "dark";
  onToggle: () => void;
}) {
  return (
    <IconButton
      onClick={onToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="w-8 h-8 justify-center text-[14px]"
    >
      {theme === "dark" ? "☀" : "☾"}
    </IconButton>
  );
}

export default function App() {
  const { data: cfg } = useConfig();
  const { data: wl } = useWatchlist();
  const { data: cryptoWl } = useCryptoWatchlist();
  const meta = cfg ? { feed: cfg.feed, paper: cfg.paper } : null;
  const [selected, setSelected] = useState<string>("");
  const [mode, setMode] = useState<PlatformMode>(readPlatformMode);
  const [assetClassMode, setAssetClassMode] = useState<AssetClassMode | null>(readAssetClassMode);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  const activeClass: AssetClassMode = assetClassMode ?? "stocks";
  const symbols = (activeClass === "crypto" ? cryptoWl?.symbols : wl?.symbols) ?? [];

  useEffect(() => {
    if (!selected && symbols.length) setSelected(symbols[0]);
  }, [symbols.join(","), selected]);

  // Global Cmd+K / Ctrl+K opens Ask anything from anywhere.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setCmdOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  function switchMode(m: PlatformMode) {
    setMode(m);
    localStorage.setItem("platform_mode", m);
  }

  function switchAssetClass(m: AssetClassMode) {
    setAssetClassMode(m);
    setSelected("");
    localStorage.setItem("asset_class_mode", m);
  }

  function openCmdBar() {
    setCmdOpen(true);
  }

  // Show splash on first load (no asset class chosen yet).
  if (assetClassMode === null) {
    return <AssetClassSplash onSelect={switchAssetClass} />;
  }

  return (
    <div className="app">
      <header>
        <div className="flex items-center justify-between gap-4 flex-wrap">
          <div className="flex items-center gap-3 min-w-0">
            <BrandMark />
            <div className="flex flex-col min-w-0">
              <span
                className="text-[15px] font-semibold leading-tight truncate"
                style={{ letterSpacing: "-0.005em" }}
              >
                Trading Platform
              </span>
              <span
                className="text-[11px] tabular-nums"
                style={{ color: "var(--mute)" }}
              >
                v{__APP_VERSION__}
                {meta && ` · ${meta.paper ? "PAPER" : "LIVE"} · ${meta.feed.toUpperCase()}`}
              </span>
            </div>
            <AssetClassToggle mode={activeClass} onChange={switchAssetClass} />
          </div>

          {/* Three-pill mode toggle */}
          <div
            className="inline-flex items-center gap-1 p-1 rounded-card"
            style={{ background: "var(--panel-2)" }}
          >
            {MODES.map((m) => (
              <ModePill
                key={m.value}
                active={mode === m.value}
                onClick={() => switchMode(m.value)}
              >
                {m.label}
              </ModePill>
            ))}
          </div>

          <div className="flex items-center gap-2">
            <AskPill onClick={openCmdBar} />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <SettingsMenu />
          </div>
        </div>
        {/* Status ribbon — Portfolio + Chart. Discover keeps the nav
           clean; the account context is already in the Discover hero. */}
        {(mode === "portfolio" || mode === "chart") && <TopBar />}
      </header>

      {/* Discover — switches content based on asset class */}
      {mode === "discover" && activeClass === "stocks" && (
        <Tools selected={selected} onSelect={setSelected} />
      )}
      {mode === "discover" && activeClass === "crypto" && (
        <CryptoTools selected={selected} onSelect={setSelected} />
      )}

      {/* TradingView full terminal + ChartBot panel — Chart mode only */}
      {mode === "chart" && (
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TVPlatform symbol={selected} onSymbolChange={setSelected} />
          </div>
          <ChatPanel symbol={selected || (activeClass === "crypto" ? "BTC/USD" : "AAPL")} />
        </div>
      )}

      {/* Portfolio: hero + positions strip + open orders + activity. Order
         entry now comes from the floating TradeBar (mounted below). */}
      {mode === "portfolio" && (
        <div className="max-w-[1280px] mx-auto pt-2">
          <PortfolioHero />

          <SectionHeading label="Positions" />
          <Positions variant="strip" onSelect={setSelected} assetClass={activeClass} />

          <SectionHeading label="Orders" />
          <Orders assetClass={activeClass} />

          <SectionHeading label="Activity" />
          <Activities />
        </div>
      )}

      {/* Floating Buy/Sell bar — Discover + Portfolio. Chart mode mounts
         its own TradeBar inside TVPlatform so it ships with TV's chrome. */}
      {(mode === "discover" || mode === "portfolio") && (
        <TradeBar symbol={selected} />
      )}

      {/* Ask anything — mounted in the app shell so it's available from
         every mode. Closed by default; openCmdBar() drives the pill click
         and the global Cmd+K / Ctrl+K hotkey toggles it. */}
      <CmdBar
        open={cmdOpen}
        onClose={() => setCmdOpen(false)}
        onOpenInWorkspace={(sym) => {
          setSelected(sym);
          switchMode("chart");
        }}
      />

      {/* Non-intrusive toast surface — bottom-right, auto-dismiss. */}
      <Toaster />
    </div>
  );
}
