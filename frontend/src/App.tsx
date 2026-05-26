import { lazy, Suspense, useEffect, useState } from "react";
import { useAppStatus, useCryptoWatchlist, useWatchlist } from "./data/hooks";
import { useTheme } from "./hooks/useTheme";
import MaintenancePage from "./components/MaintenancePage";
import Positions from "./components/Positions";
import Orders from "./components/Orders";
import Activities from "./components/Activities";
import TopBar, { HeaderEquityReadout, HeaderStatusInline } from "./components/TopBar";
import DiscoverPage from "./components/DiscoverPage";
import AssetClassSplash from "./components/AssetClassSplash";
import PortfolioHero from "./components/PortfolioHero";
import SectionHeading from "./components/SectionHeading";
import TVPlatform from "./components/TVPlatform";
import ChatPanel from "./components/chat/ChatPanel";
import TradeBar from "./components/trade/TradeBar";
import AskBar from "./components/ask/AskBar";
import { registerAppHooks } from "./lib/workspace/controller";
import SettingsMenu from "./components/SettingsMenu";
import Toaster from "./components/Toaster";
import IconButton from "./components/IconButton";
import MobileHeader from "./components/MobileHeader";
import MobileNavDrawer from "./components/MobileNavDrawer";
import { useMobile } from "./hooks/useMobile";

// Heavy, desktop-only docking canvas (pulls in Dockview) — lazy so it stays
// out of the initial bundle, mirroring how the charting library is deferred.
const Workspace = lazy(() => import("./components/Workspace"));

type PlatformMode = "discover" | "portfolio" | "chart" | "workspace";
type AssetClassMode = "stocks" | "crypto";

function readAssetClassMode(): AssetClassMode | null {
  const raw = localStorage.getItem("asset_class_mode");
  if (raw === "stocks" || raw === "crypto") return raw;
  return null;
}

// "workspace" is desktop-only; the mobile header renders its own pill set and
// deliberately omits it.
const MODES: { value: PlatformMode; label: string }[] = [
  { value: "discover", label: "Discover" },
  { value: "portfolio", label: "Portfolio" },
  { value: "chart", label: "Chart" },
  { value: "workspace", label: "Workspace" },
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
    <IconButton
      onClick={onClick}
      aria-label="Ask anything"
      title={`Ask anything (${isMac ? "⌘K" : "Ctrl+K"})`}
      className="text-[13px] px-3 py-1.5"
    >
      <span style={{ color: "var(--accent)" }} aria-hidden>
        ✦
      </span>
      <span className="hidden lg:inline">Ask anything</span>
      <span
        className="hidden lg:inline font-mono text-[11px] px-1.5 py-0.5 rounded"
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
  const { data: wl } = useWatchlist();
  const { data: cryptoWl } = useCryptoWatchlist();
  // Once force_stop is seen we latch `booted` and disable the status poll, so
  // the terminal page makes zero further requests and never auto-recovers
  // (manual browser reload only).
  const [booted, setBooted] = useState(false);
  const { data: status } = useAppStatus(!booted);
  useEffect(() => {
    if (status?.force_stop) setBooted(true);
  }, [status?.force_stop]);
  const [selected, setSelected] = useState<string>("");
  const [mode, setMode] = useState<PlatformMode>("discover");
  const [assetClassMode, setAssetClassMode] = useState<AssetClassMode | null>(readAssetClassMode);
  const [askOpen, setAskOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  // The platform always lands on the market-picker / account overview, so
  // this starts open on every load (no last-page restore).
  const [landingOpen, setLandingOpen] = useState(true);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Workspace-only immersive mode: hides the app header for a near-full-screen
  // canvas (paired with the full-bleed `.app.bleed` layout).
  const [focusMode, setFocusMode] = useState(false);
  const isMobile = useMobile();
  const { theme, toggle: toggleTheme } = useTheme();

  const activeClass: AssetClassMode = assetClassMode ?? "stocks";
  const symbols = (activeClass === "crypto" ? cryptoWl?.symbols : wl?.symbols) ?? [];

  useEffect(() => {
    if (!selected && symbols.length) setSelected(symbols[0]);
  }, [symbols.join(","), selected]);

  // Self-reload when the deployed build differs from this tab's bundle, so a
  // long-lived tab picks up new code (incl. the maintenance gate) on its own.
  // Guarded per-version via sessionStorage to avoid a reload loop if a CDN edge
  // briefly serves the old bundle.
  useEffect(() => {
    if (status?.force_stop) return; // terminal boot page must not reload itself
    const serverVer = status?.version;
    if (!serverVer || serverVer === __APP_VERSION__) return;
    const key = `reloaded_for_${serverVer}`;
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, "1");
    window.location.reload();
  }, [status?.version, status?.force_stop]);

  // Global Cmd+K / Ctrl+K opens Ask anything from anywhere.
  // Esc exits Workspace focus mode (unless a modal/sheet has focus).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setAskOpen((v) => !v);
        return;
      }
      if (e.key === "Escape" && focusMode) {
        const active = document.activeElement as HTMLElement | null;
        if (active?.closest('[role="dialog"]')) return;
        setFocusMode(false);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [focusMode]);

  function switchMode(m: PlatformMode) {
    setMode(m);
  }

  function switchAssetClass(m: AssetClassMode) {
    setAssetClassMode(m);
    setSelected("");
    localStorage.setItem("asset_class_mode", m);
  }

  // Picking a market from the landing/hub enters the platform.
  function enterMarket(m: AssetClassMode) {
    switchAssetClass(m);
    setLandingOpen(false);
    setHubOpen(false);
  }

  function openAskBar() {
    setAskOpen(true);
  }

  // Bridge App-level mode/silo control to the Ask-anything Workspace controller
  // so the bot can auto-switch into Workspace mode (and silo) before applying.
  useEffect(() => {
    registerAppHooks({
      enterWorkspace: (silo) => {
        if (silo && silo !== activeClass) switchAssetClass(silo);
        switchMode("workspace");
      },
      getEnv: () => ({ mode, assetClass: activeClass, isMobile }),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, activeClass, isMobile]);

  // Per-silo accent: stocks → green, crypto → default (blue). Overriding the
  // accent tokens here recolours selection borders, button highlights and
  // accent headers without touching the --pos/--neg P/L colours. The splash
  // is rendered outside this wrapper so its own green/blue cards are unaffected.
  const siloAccent =
    activeClass === "stocks"
      ? ({
          "--accent": "var(--pos)",
          "--accent-2": "var(--pos)",
          "--accent-bg": "var(--pos-bg)",
        } as React.CSSProperties)
      : undefined;

  if (booted || status?.force_stop)
    return <MaintenancePage message={status?.force_stop_message} terminal />;
  if (status?.maintenance) return <MaintenancePage message={status.message} />;

  return (
    <>
    <div
      className={
        mode === "workspace"
          ? "app bleed"
          : mode === "chart" && !isMobile
            ? "app app-chart"
            : "app"
      }
      style={siloAccent}
    >
      {!(mode === "workspace" && focusMode) && (
      <header>
        {isMobile ? (
          <MobileHeader
            mode={mode}
            activeClass={activeClass}
            onOpenDrawer={() => setDrawerOpen(true)}
            onOpenAsk={openAskBar}
            onSwitchMode={switchMode}
            onSwitchAssetClass={switchAssetClass}
          />
        ) : (
        // One-row, three-zone header (Identity · Mode · Account & actions).
        // Status / equity / day-P/L fold into the right zone from the old
        // TopBar strip — see HeaderStatusInline + HeaderEquityReadout. BP is
        // intentionally not surfaced here; it moves to PortfolioHero in #8.
        <div
          className="grid items-center gap-4"
          style={{ gridTemplateColumns: "auto 1fr auto" }}
        >
          <div className="flex items-center gap-3 min-w-0">
            <button
              type="button"
              onClick={() => setHubOpen(true)}
              aria-label="Open account overview"
              title="Account overview"
              className="flex items-center gap-3 border-0 bg-transparent p-0 cursor-pointer min-w-0"
            >
              <BrandMark />
              <div className="flex flex-col min-w-0 items-start leading-tight">
                <span
                  className="text-[14px] font-semibold truncate"
                  style={{ letterSpacing: "-0.005em" }}
                >
                  Trading Platform
                </span>
                <span
                  className="text-[10.5px] tabular-nums font-mono"
                  style={{ color: "var(--mute)" }}
                >
                  paper · v{__APP_VERSION__}
                </span>
              </div>
            </button>
            <span
              className="hidden lg:inline-block w-px h-6 shrink-0"
              style={{ background: "var(--hairline)" }}
              aria-hidden
            />
            <span className="hidden lg:inline-flex">
              <HeaderStatusInline assetClass={activeClass} />
            </span>
            <AssetClassToggle mode={activeClass} onChange={switchAssetClass} />
          </div>

          {/* CENTRE — Mode pills, centred via justify-self */}
          <div
            className="inline-flex items-center gap-1 p-1 rounded-card justify-self-center"
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

          {/* RIGHT — equity readout (with hairline divider) + actions */}
          <div className="flex items-center gap-3 justify-self-end">
            <HeaderEquityReadout assetClass={activeClass} />
            <span
              className="hidden lg:inline-block w-px h-7 shrink-0"
              style={{ background: "var(--hairline)" }}
              aria-hidden
            />
            <AskPill onClick={openAskBar} />
            <ThemeToggle theme={theme} onToggle={toggleTheme} />
            <SettingsMenu />
          </div>
        </div>
        )}
        {/* Mobile-only status strip. Desktop's status/equity content folded
           into the header grid above; <TopBar /> returns null on desktop. */}
        {mode !== "workspace" && <TopBar assetClass={activeClass} />}
      </header>
      )}

      {/* Discover — one surface, parameterized by the active asset class */}
      {mode === "discover" && (
        <DiscoverPage
          assetClass={activeClass}
          selected={selected}
          onSelect={setSelected}
        />
      )}

      {/* TradingView full terminal + ChartBot panel — Chart mode only */}
      {mode === "chart" && (
        <div style={{ display: "flex", flex: isMobile ? undefined : 1, minHeight: 0 }}>
          <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column" }}>
            <TVPlatform symbol={selected} onSymbolChange={setSelected} />
          </div>
          <ChatPanel symbol={selected || (activeClass === "crypto" ? "BTC/USD" : "AAPL")} />
        </div>
      )}

      {/* Workspace — CMC-style draggable / dockable / tab-stackable widget
         canvas. Desktop only; on mobile this mode is unreachable (no pill) so
         the guard falls through to nothing. */}
      {mode === "workspace" && !isMobile && (
        <Suspense
          fallback={
            <div
              className="text-[13px] py-10 text-center"
              style={{ color: "var(--mute)" }}
            >
              Loading workspace…
            </div>
          }
        >
          <Workspace
            symbol={selected}
            onSelect={setSelected}
            assetClass={activeClass}
            theme={theme}
            focus={focusMode}
            onToggleFocus={() => setFocusMode((v) => !v)}
          />
        </Suspense>
      )}

      {/* Portfolio: hero + positions strip + open orders + activity. Order
         entry now comes from the floating TradeBar (mounted below). */}
      {mode === "portfolio" && (
        <div className="max-w-[1280px] mx-auto pt-2">
          <PortfolioHero assetClass={activeClass} />

          {/* Positions is the primary block — promoted heading + full-width
             list. Orders + Activity drop to a 2-col secondary row beneath. */}
          <SectionHeading label="Positions" size="lg" />
          <Positions variant="strip" onSelect={setSelected} assetClass={activeClass} />

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <section>
              <SectionHeading label="Orders" />
              <Orders assetClass={activeClass} />
            </section>
            <section>
              <SectionHeading label="Activity" />
              <Activities />
            </section>
          </div>
        </div>
      )}

      {/* Floating Buy/Sell bar — Discover + Portfolio. Chart mode mounts
         its own TradeBar inside TVPlatform so it ships with TV's chrome. */}
      {(mode === "discover" || mode === "portfolio") && (
        <TradeBar symbol={selected} />
      )}

      {/* Ask anything — mounted in the app shell so it's available from
         every mode. Closed by default; openAskBar() drives the pill click
         and the global Cmd+K / Ctrl+K hotkey toggles it. */}
      <AskBar
        open={askOpen}
        assetClass={activeClass}
        onClose={() => setAskOpen(false)}
        onOpenInWorkspace={(sym) => {
          setSelected(sym);
          switchMode("chart");
        }}
      />

      {/* Mobile-only slide-in nav drawer (hamburger target). */}
      <MobileNavDrawer
        open={drawerOpen}
        onClose={() => setDrawerOpen(false)}
        onOpenHub={() => setHubOpen(true)}
        version={__APP_VERSION__}
      />

      {/* Non-intrusive toast surface — bottom-right, auto-dismiss. */}
      <Toaster />
    </div>

      {/* Market picker / account hub. Always shown on load (landing); also
         re-opened from the brand mark (hub, with a close button). Rendered
         outside .app so the per-silo accent override doesn't tint its own
         green/blue market cards. */}
      {(landingOpen || hubOpen) && (
        <AssetClassSplash
          onSelect={enterMarket}
          onClose={landingOpen ? undefined : () => setHubOpen(false)}
          currentClass={assetClassMode ?? undefined}
        />
      )}
    </>
  );
}
