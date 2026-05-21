import { useEffect, useState } from "react";
import { useConfig, useWatchlist } from "./data/hooks";
import { useTheme } from "./hooks/useTheme";
import Positions from "./components/Positions";
import Orders from "./components/Orders";
import Activities from "./components/Activities";
import TopBar from "./components/TopBar";
import Tools from "./components/Tools";
import PortfolioHero from "./components/PortfolioHero";
import SectionHeading from "./components/SectionHeading";
import TVPlatform from "./components/TVPlatform";
import ChatPanel from "./components/chat/ChatPanel";
import TradeBar from "./components/trade/TradeBar";
import CmdBar from "./components/cmd/CmdBar";
import Toaster from "./components/Toaster";

type PlatformMode = "discover" | "portfolio" | "chart";

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
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 text-[13px] px-3 py-1.5 rounded-card border bg-transparent cursor-pointer transition-colors"
      style={{
        borderColor: "var(--border)",
        color: "var(--text-2)",
      }}
    >
      <span style={{ color: "var(--accent)" }} aria-hidden>
        ✦
      </span>
      <span>Ask anything</span>
      <span
        className="font-mono text-[11px] px-1.5 py-0.5 rounded"
        style={{
          background: "var(--panel-2)",
          color: "var(--mute)",
        }}
      >
        {isMac ? "⌘K" : "Ctrl K"}
      </span>
    </button>
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
    <button
      type="button"
      onClick={onToggle}
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} theme`}
      className="w-8 h-8 flex items-center justify-center rounded-card border bg-transparent cursor-pointer text-[14px]"
      style={{
        borderColor: "var(--border)",
        color: "var(--text-2)",
      }}
    >
      {theme === "dark" ? "☀" : "☾"}
    </button>
  );
}

function Avatar() {
  return (
    <div
      className="w-8 h-8 rounded-full flex items-center justify-center text-[12px] font-semibold"
      style={{
        background: "var(--accent-soft)",
        color: "var(--accent-2)",
      }}
      aria-hidden
    >
      P
    </div>
  );
}

export default function App() {
  const { data: cfg } = useConfig();
  const { data: wl } = useWatchlist();
  const symbols = wl?.symbols ?? [];
  const meta = cfg ? { feed: cfg.feed, paper: cfg.paper } : null;
  const [selected, setSelected] = useState<string>("");
  const [mode, setMode] = useState<PlatformMode>(readPlatformMode);
  const [cmdOpen, setCmdOpen] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  useEffect(() => {
    if (!selected && symbols.length) setSelected(symbols[0]);
  }, [symbols.join(","), selected]);

  // Global ⌘K (or Ctrl+K) opens the command bar from anywhere.
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

  function openCmdBar() {
    setCmdOpen(true);
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
            <Avatar />
          </div>
        </div>
        {/* Status ribbon — portfolio mode only (UI-04) */}
        {mode === "portfolio" && <TopBar />}
      </header>
      {/* Discover — movers, most-active, news. Hides TopBar like Chart mode. */}
      {mode === "discover" && <Tools selected={selected} onSelect={setSelected} />}

      {/* TradingView full terminal + ChartBot panel — Chart mode only */}
      {mode === "chart" && (
        <div style={{ display: "flex" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <TVPlatform symbol={selected} onSymbolChange={setSelected} />
          </div>
          <ChatPanel symbol={selected || "AAPL"} />
        </div>
      )}

      {/* Portfolio: hero + positions strip + open orders + activity. Order
         entry now comes from the floating TradeBar (mounted below). */}
      {mode === "portfolio" && (
        <div className="max-w-[1280px] mx-auto pt-2">
          <PortfolioHero />

          <SectionHeading label="Positions" />
          <Positions variant="strip" onSelect={setSelected} />

          <SectionHeading label="Open orders" />
          <Orders />

          <SectionHeading label="Activity" />
          <Activities />
        </div>
      )}

      {/* Floating Buy/Sell bar — Discover + Portfolio only. Chart mode uses
         the persistent OrderTicketRail (phase 8). */}
      {(mode === "discover" || mode === "portfolio") && (
        <TradeBar symbol={selected} />
      )}

      {/* ⌘K command bar — mounted in the app shell so it's available from
         every mode. Closed by default; openCmdBar() drives the pill click
         and the global ⌘K hotkey toggles it. */}
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
