import { lazy, Suspense, useEffect, useRef, useState } from "react";
import {
  useAccount,
  useAppStatus,
  useCryptoWatchlist,
  useFxcmPositions,
  usePositions,
  useWatchlist,
} from "./data/hooks";
import * as api from "./api";
import { queryClient, qk } from "./data/queryClient";
import { useTheme } from "./hooks/useTheme";
import MaintenancePage from "./components/MaintenancePage";
import Positions from "./components/Positions";
import Orders from "./components/Orders";
import FxcmOrders from "./components/FxcmOrders";
import Activities from "./components/Activities";
import { HeaderEquityReadout, HeaderStatusInline } from "./components/TopBar";
import DiscoverPage from "./components/DiscoverPage";
import CfdDiscoverPage from "./components/CfdDiscoverPage";
import AssetClassSplash from "./components/AssetClassSplash";
import AllocationDonut from "./components/AllocationDonut";
import PortfolioHero from "./components/PortfolioHero";
import SectionHeading from "./components/SectionHeading";
import { isCfdSymbol, isCryptoPosition, registerFxcmSymbols } from "./lib/asset-class";
import { isSessionFresh, markActive } from "./lib/session";
import { DONUT_COLORS_GREEN } from "./components/discover/util";
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
type AssetClassMode = "stocks" | "crypto" | "cfd";

function readAssetClassMode(): AssetClassMode | null {
  const raw = localStorage.getItem("asset_class_mode");
  if (raw === "stocks" || raw === "crypto" || raw === "cfd") return raw;
  // Legacy: pre-rename the CFD silo was stored as "forex". Treat it as "cfd".
  if (raw === "forex") return "cfd";
  return null;
}

// First-session-only splash. After the user has picked a silo once, subsequent
// loads land straight on the last-used silo's Discover; the brand button
// re-opens the hub on demand.
const SPLASH_SEEN_KEY = "splash_seen_v1";
function readSplashSeen(): boolean {
  return localStorage.getItem(SPLASH_SEEN_KEY) === "1";
}

// Show the splash when the user has never picked a silo, OR when the last
// session went dormant past the freshness window (see lib/session.ts). The
// freshness clock (`last_active_at`) is refreshed on interaction + tab focus.
function shouldShowSplash(): boolean {
  return !readSplashSeen() || !isSessionFresh();
}

// Last-used platform mode — persisted so a reload lands on the same tab the
// user was on (Discover / Portfolio / Chart / Workspace) instead of always
// snapping back to Discover.
const PLATFORM_MODE_KEY = "platform_mode_v1";
function readPlatformMode(): PlatformMode {
  const raw = localStorage.getItem(PLATFORM_MODE_KEY);
  if (raw === "discover" || raw === "portfolio" || raw === "chart" || raw === "workspace") {
    return raw;
  }
  return "discover";
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
      className="flex items-center justify-center w-8 h-8 text-panel font-bold text-sm"
      style={{
        background:
          "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
        borderRadius: 9,
        boxShadow:
          "0 0 0 1px color-mix(in oklch, var(--accent) 30%, transparent), " +
          "0 4px 12px color-mix(in oklch, var(--accent) 18%, transparent)",
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
  onHoverPrefetch,
  children,
}: {
  active: boolean;
  onClick: () => void;
  onHoverPrefetch?: () => void;
  children: React.ReactNode;
}) {
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      onMouseEnter={() => { setHover(true); onHoverPrefetch?.(); }}
      onMouseLeave={() => setHover(false)}
      className="relative text-[13.5px] px-3.5 py-2 rounded-card bg-transparent border-0 cursor-pointer transition-colors"
      style={{
        color: active ? "var(--text)" : "var(--text-2)",
        fontWeight: active ? 600 : 500,
        letterSpacing: "-0.008em",
        ...(hover && !active && { color: "var(--text)" }),
      }}
    >
      {children}
      {active && (
        <span
          aria-hidden
          style={{
            position: "absolute",
            left: 14,
            right: 14,
            bottom: -8,
            height: 2,
            borderRadius: 2,
            background: "var(--accent)",
          }}
        />
      )}
    </button>
  );
}

function AskPill({ onClick }: { onClick: () => void }) {
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="Ask anything"
      title={`Ask anything (${isMac ? "⌘K" : "Ctrl+K"})`}
      className="cursor-pointer border-0 transition-colors"
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 10,
        width: "auto",
        minWidth: 34,
        maxWidth: 260,
        height: 34,
        padding: "0 6px 0 12px",
        background: "var(--panel-2)",
        border: `1px solid ${hover ? "var(--border-2)" : "var(--border)"}`,
        borderRadius: 10,
        color: "var(--mute)",
        fontWeight: 500,
        fontSize: 13,
      }}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <span
        aria-hidden
        style={{
          color: "var(--accent)",
          fontSize: 14,
          filter:
            "drop-shadow(0 0 6px color-mix(in oklch, var(--accent) 45%, transparent))",
        }}
      >
        ✦
      </span>
      <span className="hidden lg:inline" style={{ flex: 1, textAlign: "left" }}>
        Ask anything…
      </span>
      <span
        className="hidden lg:inline font-mono"
        style={{
          background: "var(--panel-3)",
          border: "1px solid var(--border)",
          boxShadow:
            "inset 0 -1px 0 var(--border-2), inset 0 1px 0 rgba(255,255,255,0.03)",
          color: "var(--text-2)",
          padding: "3px 7px",
          fontSize: 10.5,
          fontWeight: 600,
          letterSpacing: "0.02em",
          borderRadius: 4,
          marginLeft: "auto",
          lineHeight: 1,
        }}
      >
        {isMac ? "⌘ K" : "Ctrl K"}
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
  // Account is needed by every mode — fetch at the top level so it's warm
  // before the user lands on any page.
  useAccount();
  // Once force_stop is seen we latch `booted` and disable the status poll, so
  // the terminal page makes zero further requests and never auto-recovers
  // (manual browser reload only).
  const [booted, setBooted] = useState(false);
  const { data: status } = useAppStatus(!booted);
  useEffect(() => {
    if (status?.force_stop) setBooted(true);
  }, [status?.force_stop]);

  // Populate the FXCM symbol cache so isCryptoSymbol can distinguish FXCM
  // non-fiat instruments (XAU/USD, US30, ...) from crypto pairs. Fire-and-forget;
  // ISO-fiat fallback in asset-class.ts covers common CFD pairs pre-boot.
  useEffect(() => {
    api.getFxcmInstruments()
      .then((list) => registerFxcmSymbols(list.map((i) => i.instrument).filter(Boolean)))
      .catch(() => { /* bridge offline — fallback regex handles it */ });
  }, []);
  const [selected, setSelected] = useState<string>("");
  const [mode, setMode] = useState<PlatformMode>(readPlatformMode);
  const [assetClassMode, setAssetClassMode] = useState<AssetClassMode | null>(readAssetClassMode);
  const [askOpen, setAskOpen] = useState(false);
  const [hubOpen, setHubOpen] = useState(false);
  // First-session-only splash: opens on the very first load, then dismissed.
  // Also re-opens after a dormant session (see shouldShowSplash / SESSION_TTL).
  // The brand button (▾) re-opens it as the account hub.
  const [landingOpen, setLandingOpen] = useState(shouldShowSplash);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Workspace-only immersive mode: hides the app header for a near-full-screen
  // canvas (paired with the full-bleed `.app.bleed` layout).
  const [focusMode, setFocusMode] = useState(false);
  const isMobile = useMobile();
  const { theme, toggle: toggleTheme } = useTheme();

  const activeClass: AssetClassMode = assetClassMode ?? "stocks";
  // Alpaca-backed components only understand "stocks" | "crypto"; the CFD silo
  // falls back to stocks so those surfaces stay functional when CFD is active.
  const alpacaSilo: "stocks" | "crypto" = activeClass === "crypto" ? "crypto" : "stocks";
  const symbols = (activeClass === "crypto" ? cryptoWl?.symbols : wl?.symbols) ?? [];

  useEffect(() => {
    if (!selected && symbols.length) setSelected(symbols[0]);
  }, [symbols.join(","), selected]);

  // Keep the session-freshness clock current: mark active on mount, then on
  // interaction (throttled) and on tab focus. A reload while fresh resumes where
  // the user was; once this stops updating for SESSION_TTL the next load
  // re-shows the splash (see shouldShowSplash). Boot-only check — flipping back
  // to an already-mounted tab never yanks the user to the splash mid-session.
  useEffect(() => {
    markActive();
    let lastWrite = Date.now();
    const onActivity = () => {
      const now = Date.now();
      if (now - lastWrite >= 15_000) {
        lastWrite = now;
        markActive();
      }
    };
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        lastWrite = Date.now();
        markActive();
      }
    };
    window.addEventListener("pointerdown", onActivity, { passive: true });
    window.addEventListener("keydown", onActivity);
    window.addEventListener("scroll", onActivity, { passive: true });
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("pagehide", markActive);
    return () => {
      window.removeEventListener("pointerdown", onActivity);
      window.removeEventListener("keydown", onActivity);
      window.removeEventListener("scroll", onActivity);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("pagehide", markActive);
    };
  }, []);

  // Workspace is desktop-only. If a mobile reload rehydrated mode=workspace
  // (e.g. user resized down, or last session was desktop), fall back to
  // discover so the user isn't stranded on a hidden mode.
  useEffect(() => {
    if (isMobile && mode === "workspace") switchMode("discover");
  }, [isMobile, mode]);

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

  // Prefetch slow-to-compute data on mount so tab switches are instant.
  // Runs once; prefetchQuery is a no-op if the cache is already warm.
  const prefetchedRef = useRef(false);
  useEffect(() => {
    if (prefetchedRef.current) return;
    prefetchedRef.current = true;
    queryClient.prefetchQuery({ queryKey: qk.pnlHistory("stocks", "ALL"), queryFn: () => api.getPnlHistory("stocks", "ALL") });
    queryClient.prefetchQuery({ queryKey: qk.pnlHistory("crypto", "ALL"), queryFn: () => api.getPnlHistory("crypto", "ALL") });
    queryClient.prefetchQuery({ queryKey: qk.orders("all", 25), queryFn: () => api.getOrders("all", 25) });
    queryClient.prefetchQuery({ queryKey: qk.activities(25), queryFn: () => api.getActivities(25) });
  }, []);

  // Preload Workspace JS chunk on desktop so the first click is instant.
  useEffect(() => {
    if (!isMobile) import("./components/Workspace");
  }, [isMobile]);

  // Per-mode hover prefetch — fires once per hover (prefetchQuery is a no-op
  // when data is fresh, so repeated hovers are free).
  const prefetchedModes = useRef(new Set<string>());
  function prefetchMode(m: PlatformMode) {
    const key = `${m}:${activeClass}`;
    if (prefetchedModes.current.has(key)) return;
    prefetchedModes.current.add(key);
    if (m === "portfolio") {
      queryClient.prefetchQuery({ queryKey: qk.pnlHistory(alpacaSilo, "ALL"), queryFn: () => api.getPnlHistory(alpacaSilo, "ALL") });
      queryClient.prefetchQuery({ queryKey: qk.orders("all", 25), queryFn: () => api.getOrders("all", 25) });
      queryClient.prefetchQuery({ queryKey: qk.activities(25), queryFn: () => api.getActivities(25) });
    } else if (m === "chart" && selected) {
      queryClient.prefetchQuery({ queryKey: qk.bars(selected, "1Day"), queryFn: () => api.getBars(selected, "1Day", 200) });
    } else if (m === "workspace" && !isMobile) {
      import("./components/Workspace");
    }
  }

  function switchMode(m: PlatformMode) {
    setMode(m);
    try {
      localStorage.setItem(PLATFORM_MODE_KEY, m);
    } catch {
      /* private mode / quota — non-fatal, just won't persist */
    }
  }

  function switchAssetClass(m: AssetClassMode) {
    setAssetClassMode(m);
    setSelected("");
    localStorage.setItem("asset_class_mode", m);
  }

  // Bridge for child surfaces that don't have a direct callback path — the
  // Settings menu's silo switcher dispatches this so it can flip silos
  // without prop-drilling switchAssetClass through three levels.
  useEffect(() => {
    function onSwitch(e: Event) {
      const detail = (e as CustomEvent<{ silo?: AssetClassMode }>).detail;
      if (detail?.silo === "stocks" || detail?.silo === "crypto" || detail?.silo === "cfd") {
        switchAssetClass(detail.silo);
      }
    }
    window.addEventListener("trading-platform:switch-silo", onSwitch);
    return () =>
      window.removeEventListener("trading-platform:switch-silo", onSwitch);
  }, []);

  // Picking a market from the landing/hub enters the platform. The first time
  // through, mark the splash as seen so subsequent loads skip straight to
  // Discover; the brand button still re-opens the hub on demand.
  function enterMarket(m: AssetClassMode) {
    switchAssetClass(m);
    try {
      localStorage.setItem(SPLASH_SEEN_KEY, "1");
    } catch {
      /* private mode / quota — non-fatal */
    }
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
      : activeClass === "cfd"
        ? ({
            "--accent": "oklch(72% 0.18 55)",
            "--accent-2": "oklch(72% 0.18 55)",
            "--accent-bg": "oklch(72% 0.18 55 / 0.12)",
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
          style={{
            gridTemplateColumns: "auto 1fr auto",
            paddingBottom: 14,
            borderBottom: "1px solid var(--hairline)",
          }}
        >
          <div className="flex items-center gap-3 min-w-0">
            {/* Brand button now stands in for the asset-class toggle: it
               surfaces the active silo with a ▾ chevron and re-opens the
               account hub (where the user picks again). The standalone
               stocks/crypto pill is gone — the hub is what silo switching
               is for. */}
            <button
              type="button"
              onClick={() => setHubOpen(true)}
              aria-label="Account hub · switch market"
              title="Account hub · switch market"
              className="flex items-center gap-3 border-0 bg-transparent p-0 cursor-pointer min-w-0"
            >
              <BrandMark />
              <div className="flex flex-col min-w-0 items-start leading-tight">
                <span
                  className="text-[14px] font-semibold truncate inline-flex items-center gap-1"
                  style={{ letterSpacing: "-0.005em" }}
                >
                  {activeClass === "crypto" ? "Crypto" : activeClass === "cfd" ? "CFDs" : "Stocks"}
                  <span
                    aria-hidden
                    style={{ color: "var(--mute)", fontSize: 10 }}
                  >
                    ▾
                  </span>
                </span>
                <span
                  className="text-[10.5px] tabular-nums font-mono"
                  style={{ color: "var(--mute)" }}
                >
                  v{__APP_VERSION__}
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
          </div>

          {/* CENTRE — Mode pills, centred via justify-self */}
          <div
            className="inline-flex items-center gap-1 justify-self-center"
          >
            {MODES.map((m) => (
              <ModePill
                key={m.value}
                active={mode === m.value}
                onClick={() => switchMode(m.value)}
                onHoverPrefetch={() => prefetchMode(m.value)}
              >
                {m.label}
              </ModePill>
            ))}
          </div>

          {/* RIGHT — equity readout (with hairline divider) + actions */}
          <div className="flex items-center gap-3 justify-self-end">
            <HeaderEquityReadout assetClass={alpacaSilo} />
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
      </header>
      )}

      {/* Discover — parameterized by active asset class; CFDs get their own surface */}
      {mode === "discover" && activeClass === "cfd" && (
        <CfdDiscoverPage
          onSelectSymbol={(s) => setSelected(s)}
          onOpenChart={() => switchMode("chart")}
        />
      )}
      {mode === "discover" && activeClass !== "cfd" && (
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
            <TVPlatform
              symbol={
                activeClass === "cfd"
                  ? (isCfdSymbol(selected) ? selected : "EUR/USD")
                  : selected
              }
              onSymbolChange={setSelected}
              assetClass={activeClass}
            />
          </div>
          <ChatPanel
            symbol={selected || (activeClass === "crypto" ? "BTC/USD" : activeClass === "cfd" ? "EUR/USD" : "AAPL")}
            assetClass={activeClass}
          />
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

      {/* Portfolio: hero + allocation + positions strip + open orders +
         activity. Order entry now comes from the floating TradeBar (mounted
         below). */}
      {mode === "portfolio" && (
        <div className="max-w-[1280px] mx-auto pt-2">
          <PortfolioHero assetClass={activeClass} />

          <PortfolioAllocation activeClass={activeClass} />

          {/* Positions is the primary block — promoted heading + full-width
             list. Orders + Activity drop to a 2-col secondary row beneath. */}
          <SectionHeading label="Positions" size="lg" />
          <Positions
            variant="strip"
            onSelect={(s) => {
              setSelected(s);
              switchMode("chart");
            }}
            assetClass={activeClass}
          />

          <div className="grid gap-4 grid-cols-1 lg:grid-cols-2">
            <section>
              <SectionHeading label="Orders" />
              {activeClass === "cfd" ? (
                <FxcmOrders />
              ) : (
                <Orders assetClass={activeClass} />
              )}
            </section>
            <section>
              <SectionHeading label="Activity" />
              <Activities assetClass={activeClass} />
            </section>
          </div>
        </div>
      )}

      {/* Floating Buy/Sell bar — Discover + Portfolio across all silos.
         Chart mode mounts its own TradeBar inside TVPlatform. CFD routes
         the same bar to FxcmOrderSheet via the assetClass prop. */}
      {(mode === "discover" || mode === "portfolio") && (
        <TradeBar symbol={activeClass === "cfd" ? (isCfdSymbol(selected) ? selected : "") : selected} assetClass={activeClass} />
      )}

      {/* Mobile-only floating ✦ Ask launcher. Bottom-left so it sits in the
         same screen real-estate as ChartBot's violet launcher (chart mode):
         the user reaches for one corner regardless of mode. Suppressed in
         Chart itself — ChartBot already owns this corner there, two circles
         would read as noise. The right corner stays free for TradeBar. */}
      {isMobile && mode !== "chart" && (
        <button
          type="button"
          aria-label="Ask anything"
          title="Ask anything"
          onClick={openAskBar}
          className="cursor-pointer border-0"
          style={{
            position: "fixed",
            left: 16,
            bottom: "calc(var(--safe-bottom) + 16px)",
            zIndex: 34,
            width: 48,
            height: 48,
            borderRadius: 999,
            background: "var(--accent)",
            color: "white",
            fontSize: 20,
            boxShadow: "var(--shadow-lg)",
          }}
        >
          ✦
        </button>
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

// Allocation card on Portfolio. Lives here (not inside PortfolioHero) so the
// hero stays focused on the silo's headline numbers — the donut is a sibling
// section beneath, gated on having any open positions in the active silo.
function PortfolioAllocation({
  activeClass,
}: {
  activeClass: AssetClassMode;
}) {
  const positions = usePositions();
  const fxcm = useFxcmPositions(activeClass === "cfd");
  // FXCM returns one row per trade lot. Net per instrument so the donut shows
  // one slice per pair/CFD (matching the netted Positions blotter), not one
  // slice per lot. used_margin is the per-position $ exposure on a CFD book.
  const siloPositions =
    activeClass === "cfd"
      ? Array.from(
          (fxcm.data || []).reduce((acc, p) => {
            const symbol = String(p.instrument || "");
            if (!symbol) return acc;
            const margin = Number(
              (p.used_margin as number | undefined) ?? p.market_value ?? 0,
            );
            acc.set(symbol, (acc.get(symbol) || 0) + margin);
            return acc;
          }, new Map<string, number>()),
        ).map(([symbol, market_value]) => ({ symbol, market_value }))
      : (positions.data?.positions || []).filter((p) =>
          activeClass === "crypto" ? isCryptoPosition(p) : !isCryptoPosition(p),
        );
  if (siloPositions.length === 0) return null;
  return (
    <div
      className="rounded-card-lg mb-6"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      <AllocationDonut
        positions={siloPositions as unknown as Parameters<typeof AllocationDonut>[0]["positions"]}
        colors={activeClass === "stocks" ? DONUT_COLORS_GREEN : undefined}
      />
    </div>
  );
}
