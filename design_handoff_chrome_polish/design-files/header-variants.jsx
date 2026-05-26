// Header variants — each variant is the SAME three-zone layout as App.tsx;
// the difference is class names attached to the outer .hb-shell. The actual
// per-variant deltas (typography, weights, mode-pill active treatment, ask
// pill chrome, kbd cap, icon button chrome, equity sizing) live in the
// <style> block in Header Polish.html so the markup stays direct-editable.

function BrandMark() {
  return (
    <button type="button" className="hb-brand-btn" aria-label="Account hub · switch market">
      <span className="hb-mark" aria-hidden>◆</span>
      <span className="hb-brand-text">
        <span className="hb-brand-title">
          Stocks
          <span className="hb-brand-chev" aria-hidden>▾</span>
        </span>
        <span className="hb-brand-ver">v0.70.0</span>
      </span>
    </button>
  );
}

function MarketStatus() {
  // Mirrors HeaderStatusInline from TopBar.tsx — pre-open weekday morning.
  return (
    <span className="hb-status" title="Stocks · pre-market">
      <span className="dot" aria-hidden></span>
      <span className="label">Closed</span>
      <span className="sub">opens 09:30 AM</span>
    </span>
  );
}

function ModePills({ active = "Discover" }) {
  const modes = ["Discover", "Portfolio", "Chart", "Workspace"];
  return (
    <div className="hb-modes" role="tablist">
      {modes.map((m) => (
        <button
          key={m}
          type="button"
          role="tab"
          aria-selected={m === active}
          className={`hb-mode ${m === active ? "active" : ""}`}
        >
          {m}
        </button>
      ))}
    </div>
  );
}

function EquityReadout({ withSep = false }) {
  // Mirrors HeaderEquityReadout from TopBar.tsx — values from the screenshot.
  return (
    <div className="hb-equity" aria-label="Account equity and today's P/L">
      <span className="value">$100,819.86</span>
      <span className="delta">
        {withSep ? (
          <>
            <span>−$831.75</span>
            <span className="sep" aria-hidden>·</span>
            <span>−0.82% today</span>
          </>
        ) : (
          <>−$831.75 · −0.82% today</>
        )}
      </span>
    </div>
  );
}

function AskPill() {
  // Current IconButton-style pill: ✦ + label + Ctrl K cap.
  return (
    <button type="button" className="hb-ask" aria-label="Ask anything · Ctrl K">
      <span className="sparkle" aria-hidden>✦</span>
      <span>Ask anything</span>
      <span className="kbd" aria-hidden>Ctrl K</span>
    </button>
  );
}

function AskField() {
  // Search-field treatment: placeholder-style label on the left, kbd right.
  return (
    <button type="button" className="hb-ask" aria-label="Ask anything · Ctrl K">
      <span className="sparkle" aria-hidden>✦</span>
      <span className="label">Ask anything…</span>
      <span className="kbd" aria-hidden>⌘ K</span>
    </button>
  );
}

function IconBtn({ children, ariaLabel }) {
  return (
    <button type="button" className="hb-icon" aria-label={ariaLabel}>
      {children}
    </button>
  );
}

// Faux page surface beneath the header — the band sits on a typical Discover-
// like split (main + watchlist sidebar) so the chrome reads grounded, not
// floating in space.
function FauxStage() {
  return (
    <div className="hb-stage" aria-hidden>
      <div className="hb-block"></div>
      <div className="hb-block"></div>
    </div>
  );
}

// Shared shell — variant class on outer div drives the CSS overrides.
function HeaderShell({ variant, askKind = "pill", equityWithSep = false }) {
  const Ask = askKind === "field" ? AskField : AskPill;
  return (
    <div className={`hb-shell ${variant}`}>
      <div className={`hb-band ${variant === "v4" ? "with-divider" : ""}`}>
        <div className="hb-grid">
          <div style={{ display: "inline-flex", alignItems: "center", gap: 14, minWidth: 0 }}>
            <BrandMark />
            <span className="hb-pipe" aria-hidden></span>
            <MarketStatus />
          </div>
          <ModePills />
          <div className="hb-right">
            <EquityReadout withSep={equityWithSep} />
            <span className="hb-pipe tall" aria-hidden></span>
            <Ask />
            <IconBtn ariaLabel="Toggle theme">☾</IconBtn>
            <IconBtn ariaLabel="Settings">⚙</IconBtn>
          </div>
        </div>
      </div>
      <FauxStage />
    </div>
  );
}

function HeaderV0() { return <HeaderShell variant="v0" />; }
function HeaderV1() { return <HeaderShell variant="v1" />; }
function HeaderV2() { return <HeaderShell variant="v2" />; }
function HeaderV3() { return <HeaderShell variant="v3" askKind="field" />; }
function HeaderV4() { return <HeaderShell variant="v4" askKind="field" equityWithSep />; }

Object.assign(window, { HeaderV0, HeaderV1, HeaderV2, HeaderV3, HeaderV4 });
