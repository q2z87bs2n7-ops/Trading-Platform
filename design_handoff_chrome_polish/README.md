# Handoff · Chrome polish (header + TipRanks widgets)

**Target repo**: `q2z87bs2n7-ops/Trading-Platform` @ `main` (v0.70.0)
**Branch convention**: follow `CLAUDE.md` — make a `claude/<topic>` branch, bump `VERSION` patch (Z) on each commit, do not merge to main without explicit approval.

---

## Overview

Two unrelated polish efforts bundled together:

1. **Desktop header chrome** (`App.tsx` three-zone header). The user described the existing chrome as feeling "a level below the rest of the platform" — slightly robotic kbd cap, photocopied active mode-pill, over-bold red day-P/L, plain icon buttons. The polish refines type / weight / dividers / kbd / equity hierarchy / mode-nav style without changing content, layout, or behaviour. **iPad and mobile are out of scope** — only the desktop branch (`!isMobile`) of `<header>` in `App.tsx` changes.

2. **TipRanks research widgets** (8 cards in `frontend/src/components/research/*` + one in `frontend/src/components/discover/TrendingResearchCard.tsx`). Universal sweep across dividers / labels / badges / chips / bars, plus per-widget specifics (headline sizes, mini bar charts, delta arrows, gauge rail, rail-style cohort selector). **No backend changes, no data-shape changes, no content/copy changes.**

---

## About the design files

`design-files/` contains **HTML prototypes built as design references** — they are not production code to copy verbatim. They use Inter / IBM Plex Mono via Google Fonts, the exact CSS tokens already defined in `frontend/src/index.css`, and React 18 via Babel for live interactivity.

**The task is to apply the polish to the existing React + TypeScript codebase** following its established patterns (`var(--…)` tokens, inline-style objects for one-off looks, Tailwind utility classes where the project already uses them, `frontend/src/index.css` for shared styles). Mock data in the prototypes is illustrative — the real components keep their existing prop shapes (`SmartScoreRow`, `SentimentRow`, etc.).

**To view the prototypes locally**: open the `.html` files in a browser. They are self-contained — no build step. `TipRanks Polish.html` has a Tweaks panel in the bottom-right with a `Polish ON` toggle to A/B against the v0.70 baseline.

## Fidelity

**Hi-fi.** Every CSS token, weight, padding value, and pixel size in the prototypes is final and should be matched precisely. The polish is intentionally subtle — incorrect values will look identical to the baseline. Use the v0.70 source under `source-reference/` as the diff target.

---

## Repo files this handoff touches

```
frontend/src/
├── App.tsx                                          ← header zone JSX + Brand/Mode/Ask pills
├── index.css                                        ← shared polish CSS (new section at end)
├── components/
│   ├── IconButton.tsx                               ← chrome refinement for theme/settings
│   ├── TopBar.tsx                                   ← HeaderEquityReadout (calmer weights)
│   ├── research/
│   │   ├── SmartScoreCard.tsx                       ← gauge rail, PT chip
│   │   ├── SentimentCard.tsx                        ← buzz chip, taller bars
│   │   ├── AnalystRatingsCard.tsx                   ← chip-style badges, hit-rate mini bar
│   │   ├── HedgeFundsCard.tsx                       ← bigger signal, quarterly mini bar chart
│   │   ├── InsidersCard.tsx                         ← bigger headline, amber stars
│   │   ├── RelatedTickersCard.tsx                   ← rail-style cohort selector
│   │   └── HolderDemographicsCard.tsx               ← delta arrows, cohort top-borders
│   └── discover/
│       └── TrendingResearchCard.tsx                 ← consensus chip, row hover
```

All originals are in `source-reference/` for direct diff reference.

---

# Part 1 — Header polish

**Design file**: `design-files/Header Polish.html`. Five artboards (V0 baseline through V4 ship candidate).
**Ship target**: V4 in the prototype — see the `.v4 *` rules in the `<style>` block.

The desktop header lives in `App.tsx` lines ~336-409 (the `!isMobile` branch). The polish keeps the three-zone grid (`auto 1fr auto`), zone contents, and React state unchanged — only chrome and a couple of inline-style values change.

## H1 · Header band

**File**: `App.tsx` lines ~336-340 — the outer `<div className="grid items-center gap-4">`

Add a 1-px hairline divider beneath the header band, and slightly reduce the bottom padding so the divider sits at a deliberate distance.

The current header has no separator from the page surface. Wrap the existing grid in a band that owns the padding + divider:

```diff
- <div
-   className="grid items-center gap-4"
-   style={{ gridTemplateColumns: "auto 1fr auto" }}
- >
+ <div
+   className="grid items-center gap-4"
+   style={{
+     gridTemplateColumns: "auto 1fr auto",
+     paddingBottom: 14,
+     borderBottom: "1px solid var(--hairline)",
+   }}
+ >
```

Note: the existing `header` selector in `index.css` already provides `margin-bottom: 16px` — keep that. The new bottom divider sits inside the header, the spacing below sits outside.

## H2 · Brand mark — subtle accent glow

**File**: `App.tsx`, `BrandMark()` function lines ~73-85.

Add a faint accent-tinted ring + drop shadow on the mark so it reads as a deliberate logo, not a generic gradient blob:

```diff
  <div
    className="flex items-center justify-center w-8 h-8 rounded-card text-panel font-bold text-sm"
    style={{
      background:
        "linear-gradient(135deg, var(--accent) 0%, var(--accent-2) 100%)",
+     borderRadius: 9,
+     boxShadow:
+       "0 0 0 1px color-mix(in oklch, var(--accent) 30%, transparent), " +
+       "0 4px 12px color-mix(in oklch, var(--accent) 18%, transparent)",
    }}
    aria-hidden
  >
    ◆
  </div>
```

The 9-px border-radius (vs `rounded-card` = 10) is intentional — the inner halo makes the mark feel a hair tighter.

## H3 · Mode pills — rail nav (V2+V4 blend)

**File**: `App.tsx`, `ModePill` component lines ~88-110 + the container at lines ~366-378.

The current "panel-2 container + active pill = panel + shadow-sm" treatment is the weakest part of the header on Chrome/Windows (shadow barely renders, active state reads as photocopied). Replace with a rail-style nav: no container chrome, accent underline on the active mode.

Replace the entire `ModePill` component and its wrapping container:

```tsx
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
      className="relative text-[13.5px] px-3.5 py-2 rounded-card bg-transparent border-0 cursor-pointer transition-colors"
      style={{
        color: active ? "var(--text)" : "var(--text-2)",
        fontWeight: active ? 600 : 500,
        letterSpacing: "-0.008em",
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
```

And drop the segmented-control container styling on the wrapper:

```diff
  {/* CENTRE — Mode pills, centred via justify-self */}
  <div
-   className="inline-flex items-center gap-1 p-1 rounded-card justify-self-center"
-   style={{ background: "var(--panel-2)" }}
+   className="inline-flex items-center gap-1 justify-self-center"
  >
    {MODES.map((m) => (
      <ModePill … />
    ))}
  </div>
```

Add a hover style via inline `onMouseEnter` / `onMouseLeave` or via Tailwind `hover:` if available — the prototype uses `color: var(--text)` and a faint panel bg on hover for non-active items. The active item should not respond to hover.

Acceptance: in the V4 prototype the active mode shows a 2-px accent underline 8 px below the text baseline, with the underline width matching the text (not the full button — note `left: 14, right: 14`).

## H4 · Ask anything — search-field treatment

**File**: `App.tsx`, `AskPill` component lines ~112-132.

The current `IconButton` chrome (panel + border + shadow-sm) reads as a chip. Switch to a search-field look: wider, panel-2 fill, placeholder-style label, kbd cap right-aligned. Linear / Vercel idiom.

```tsx
function AskPill({ onClick }: { onClick: () => void }) {
  const isMac =
    typeof navigator !== "undefined" && /mac/i.test(navigator.platform);
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
        width: 260,
        height: 34,
        padding: "0 6px 0 12px",
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        color: "var(--mute)",
        fontWeight: 500,
        fontSize: 13,
      }}
      onMouseEnter={(e) => {
        e.currentTarget.style.borderColor = "var(--border-2)";
      }}
      onMouseLeave={(e) => {
        e.currentTarget.style.borderColor = "var(--border)";
      }}
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
```

Three deltas vs current:
- **Width**: from intrinsic to fixed `260px` — feels like a search input, not a chip
- **✦ glow**: `drop-shadow` filter using `color-mix` with `--accent` 45% → a subtle halo
- **Kbd cap**: `--panel-3` fill + `inset 0 -1px 0 --border-2` bottom bevel + `inset 0 1px 0 rgba(255,255,255,0.03)` top highlight → reads as a real keycap, not printer ink

## H5 · Theme + Settings buttons — flat chrome

**File**: `App.tsx`, `ThemeToggle` lines ~134-149 + `SettingsMenu` lines ~unchanged (it owns its own button).
**Also touches**: `components/IconButton.tsx` (since both buttons use it).

The current `IconButton` (panel fill + border + shadow-sm) gives every utility button equal visual weight. With the Ask pill expanding to 260 px, the theme/settings squares should recede.

Edit `IconButton.tsx` to make panel fill + shadow opt-in (default: transparent + transparent border, hover → panel-2 + border):

```diff
- <button
-   …
-   className={`inline-flex items-center gap-2 rounded-card border cursor-pointer transition-colors ${className}`}
-   style={{
-     background: "var(--panel)",
-     borderColor: active || hover ? "var(--border-2)" : "var(--border)",
-     boxShadow: "var(--shadow-sm)",
-     color: active ? "var(--accent)" : hover ? "var(--text)" : "var(--text-2)",
-     ...style,
-   }}
- >
+ <button
+   …
+   className={`inline-flex items-center gap-2 rounded-card border cursor-pointer transition-colors ${className}`}
+   style={{
+     background: active || hover ? "var(--panel-2)" : "transparent",
+     borderColor: active || hover ? "var(--border)" : "transparent",
+     boxShadow: "none",
+     color: active ? "var(--accent)" : hover ? "var(--text)" : "var(--text-2)",
+     ...style,
+   }}
+ >
```

**Caveat**: `IconButton` is also used by `AskPill` in the current code — but H4 above replaces `AskPill` with a plain `<button>` that doesn't use IconButton, so this edit affects only `ThemeToggle` + `SettingsMenu`'s gear button. Verify by grepping `IconButton` across `frontend/src/components/`.

If `SettingsMenu` uses `IconButton` and you want the gear to keep its panel-fill, add an `prominent` prop and gate the new flat style on `!prominent`. Simpler: just accept the visual change — both buttons should recede.

## H6 · Equity readout — calmer hierarchy

**File**: `components/TopBar.tsx`, `HeaderEquityReadout` lines ~82-105.

Current: `$100,819.86` at 14 px font-semibold (600) + `-$831.75 · -0.82% today` at 11.5 px font-semibold (600) in pure `--neg`. Both lines are too bold; the day delta is a red shout.

Make the value larger but lighter, and soften the delta:

```diff
  export function HeaderEquityReadout({ assetClass: _assetClass }: { assetClass: AssetClass }) {
    const { data: acct } = useAccount();
    if (!acct) return null;
    const pl = acct.equity - acct.equity_at_market_open;
    const plpc = acct.equity_at_market_open > 0 ? pl / acct.equity_at_market_open : 0;
    const up = pl >= 0;
    return (
      <div className="flex flex-col items-end leading-tight">
        <span
-         className="tabular-nums font-mono text-[14px] font-semibold"
+         className="tabular-nums font-mono"
+         style={{ fontSize: 15.5, fontWeight: 550, letterSpacing: "-0.01em" }}
        >
          {money(acct.equity)}
        </span>
        <span
-         className="tabular-nums font-mono text-[11.5px] font-semibold"
-         style={{ color: up ? "var(--pos)" : "var(--neg)" }}
+         className="tabular-nums font-mono"
+         style={{
+           fontSize: 12,
+           fontWeight: 500,
+           color: up
+             ? "color-mix(in oklch, var(--pos) 90%, var(--text))"
+             : "color-mix(in oklch, var(--neg) 88%, var(--text))",
+         }}
        >
-         {up ? "+" : ""}
-         {money(pl)} · {up ? "+" : ""}
-         {(plpc * 100).toFixed(2)}% today
+         {up ? "+" : "−"}
+         {money(Math.abs(pl))}
+         <span style={{ color: "var(--mute)", margin: "0 6px", fontWeight: 400 }}>·</span>
+         {up ? "+" : "−"}
+         {Math.abs(plpc * 100).toFixed(2)}% today
        </span>
      </div>
    );
  }
```

Three deltas:
- **Proper minus sign** (`−` U+2212, not hyphen-minus) — reads as a real numeric delta, not a dash
- **Bullet separator** styled as muted weight-400 so the two numeric values are the bold reads, not the punctuation between them
- **Color** uses `color-mix` to blend ~10% of `--text` into the P/L hue — keeps the semantic but softens the shout. Especially important against `--bg` in dark mode.

**Note on the iPad-specific concern the user raised** ("boldness of equity and todays p/l"): this same component renders on iPad in landscape (the desktop branch fires above 640 px). The font-weight drop from 600 → 550 and 600 → 500 fixes both surfaces in one change.

---

# Part 2 — TipRanks widget polish

**Design file**: `design-files/TipRanks Polish.html` — open it, use the Tweaks panel (bottom-right) to flip `Polish ON` and compare against the v0.70 baseline. `Show callouts` is currently a stub for future annotation overlays.

Polish lives entirely in `frontend/src/components/research/*.tsx` and one file under `discover/`. All edits keep the existing prop shapes, data hooks, paging, and skeletons.

## Universal sweep — apply to all 8 widgets

These are the changes that recur across every card. Easiest path: lift them into shared CSS rather than hand-editing 8 files.

### U1 · Inner row dividers: `--border` → `--hairline`

The `--border` token (#1f242c in dark) feels heavy when used between dense rows — adjacent rows visually blur. Use `--hairline` (rgba(255,255,255,0.06) in dark) for **inner row dividers within a section**, keep `--border` for **section breaks**.

Search-and-replace within the widget files:
- All occurrences of `borderTop: i === 0 ? "none" : "1px solid var(--border)"` (row index pattern) → `borderTop: i === 0 ? "none" : "1px solid var(--hairline)"`
- All occurrences of `borderTop: rank === 0 ? "none" : "1px solid var(--border)"` → same swap
- Section-break dividers (between Section components in SentimentCard, between top stats + holdings in HedgeFundsCard, between footer + cohorts in HolderDemographics) **keep** `--border` — those are intentional category separators.

Files affected: all 8 widgets.

### U2 · Section labels — tracking + weight

The `text-[10px] uppercase tracking-wide` mute labels read flat. Bump them to `font-size: 10.5px; letter-spacing: 0.06em; font-weight: 500;` and brighten the color via `color-mix(in oklab, var(--mute) 70%, var(--text-2))`.

In the prototype this is `.tr-sec` under `.polish`:

```css
.polish .tr-sec {
  font-size: 10.5px;
  letter-spacing: 0.06em;
  font-weight: 500;
  color: color-mix(in oklab, var(--mute) 70%, var(--text-2));
}
```

In the codebase: every label that currently uses the inline pattern
```tsx
<span
  className="text-[10px] uppercase"
  style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
>
```
gets updated to
```tsx
<span
  className="uppercase"
  style={{
    fontSize: 10.5,
    color: "color-mix(in oklab, var(--mute) 70%, var(--text-2))",
    letterSpacing: "0.06em",
    fontWeight: 500,
  }}
>
```

Files affected: `SentimentCard.tsx`, `HedgeFundsCard.tsx`, `InsidersCard.tsx`, `HolderDemographicsCard.tsx`.

**Refactor opportunity**: extract `<SectionLabel>` as a tiny shared component in `frontend/src/components/research/_shared/SectionLabel.tsx`. Worth it given the count.

### U3 · Action badges → proper pills

The v0.70 badges use `color-mix(in oklab, currentColor 12%, transparent)` as a tinted fill with no border — they read as inline text with highlighter behind them. Replace with proper outlined pill chips:

```diff
- <span
-   className="text-[10px] uppercase font-medium tracking-wide px-1 py-0.5 rounded"
-   style={{
-     color: actionColor,
-     background: "color-mix(in oklab, currentColor 12%, transparent)",
-   }}
- >
+ <span
+   className="uppercase"
+   style={{
+     fontSize: 10,
+     fontWeight: 600,
+     letterSpacing: "0.05em",
+     padding: "2px 7px",
+     borderRadius: 999,
+     color: actionColor,
+     background: "color-mix(in oklch, currentColor 14%, transparent)",
+     border: "1px solid color-mix(in oklch, currentColor 35%, transparent)",
+     whiteSpace: "nowrap",
+   }}
+ >
```

Files affected: `AnalystRatingsCard.tsx` (`ActionBadge`), `HedgeFundsCard.tsx` (inline `<span>` in `FundRow`), `InsidersCard.tsx` (confidence-signal chip).

**While there — fix the `Initiated` colour fallback** in `AnalystRatingsCard.tsx`'s `actionColor`:

```diff
- if (lc.startsWith("initiat")) return "var(--accent, var(--text))";
+ if (lc.startsWith("initiat")) return "var(--accent)";
```

`var(--accent, var(--text))` was falling back to text because `--accent` is always defined. Use the accent directly — the "Initiated" badge should be teal, not text-grey.

### U4 · Star ratings (Insiders) — amber filled

`InsidersCard.tsx`, `StarBar` (lines ~5-19). The all-mute treatment looks like ASCII art. Use amber for filled stars, `--border-2` for hollow:

Add to `index.css`:
```css
--amber: oklch(78% 0.14 75);
```

Update `StarBar`:
```diff
  function StarBar({ stars }: { stars: number | null }) {
    if (stars == null || Number.isNaN(stars)) return null;
    const filled = Math.round(Math.max(0, Math.min(5, stars)));
    return (
      <span
-       className="text-[10px] tabular-nums"
-       style={{ color: "var(--mute)" }}
+       style={{ fontSize: 10.5, fontVariantNumeric: "tabular-nums" }}
        title={`Insider rating ${stars.toFixed(1)} / 5`}
      >
-       {"★".repeat(filled)}
-       {"☆".repeat(5 - filled)}
+       <span style={{ color: "var(--amber)" }}>{"★".repeat(filled)}</span>
+       <span style={{ color: "var(--border-2)" }}>{"☆".repeat(5 - filled)}</span>
      </span>
    );
  }
```

### U5 · Sentiment + monthly bars — taller + inset shadow

The 2-px `SentimentBar` in `SentimentCard.tsx` and 1.5-px `MonthlyBar` in `InsidersCard.tsx` are too thin to register as surfaces. Bump heights and add a subtle inset shadow so they read as inlaid wells, not divider strips.

`SentimentCard.tsx`, `SentimentBar`:
```diff
- <div
-   className="flex h-2 w-full overflow-hidden rounded"
-   style={{ background: "var(--panel-2)" }}
- >
+ <div
+   className="flex w-full overflow-hidden"
+   style={{
+     height: 9,
+     borderRadius: 5,
+     background: "var(--panel-2)",
+     boxShadow:
+       "inset 0 1px 0 rgba(0,0,0,0.25), inset 0 -1px 0 rgba(255,255,255,0.02)",
+   }}
+ >
```

`InsidersCard.tsx`, `MonthlyBar`:
```diff
- <div
-   className="flex h-1.5 w-full overflow-hidden rounded"
-   style={{ background: "var(--panel-2)" }}
- >
+ <div
+   className="flex w-full overflow-hidden"
+   style={{
+     height: 7,
+     borderRadius: 3,
+     background: "var(--panel-2)",
+     boxShadow:
+       "inset 0 1px 0 rgba(0,0,0,0.25), inset 0 -1px 0 rgba(255,255,255,0.02)",
+   }}
+ >
```

### U6 · Card outer chrome — softer shadow

Every widget's outer (non-`bare`) render uses:
```tsx
boxShadow: "var(--shadow-sm)"
```
which renders unevenly on Windows. Replace with a hairline ring + minimal drop:

```diff
- boxShadow: "var(--shadow-sm)",
+ boxShadow:
+   "0 0 0 1px var(--hairline), 0 1px 1px rgba(0,0,0,0.25)",
```

Files affected: all 8 widgets (the outer wrapper `<div className="p-[18px]">`).

Also bump padding to `padding: "16px 18px"` (less symmetric, tighter vertical rhythm — matches the prototype's `.polish .tr-card`).

---

## Per-widget polish

### W1 · SmartScore

**File**: `SmartScoreCard.tsx`, headline section lines ~119-141.

Two changes:
1. **Move the PT readout into a corner chip** instead of inline next to the score label.
2. **Add a 0–10 gauge rail** under the headline so the score reads as a position on a scale.

After the existing baseline-aligned `<div className="flex items-baseline gap-3 flex-wrap">`, insert the gauge rail:

```tsx
{/* Gauge rail — 0-10 position indicator. Tick at the actual score. */}
{row.smart_score != null && (
  <div
    style={{
      position: "relative",
      width: "100%",
      height: 4,
      background: "color-mix(in oklch, var(--panel-2) 70%, var(--bg))",
      borderRadius: 2,
      margin: "4px 0 2px",
      overflow: "hidden",
    }}
    aria-hidden
  >
    <div
      style={{
        height: "100%",
        width: "100%",
        background: "linear-gradient(90deg, var(--neg), var(--mute) 50%, var(--pos))",
        borderRadius: 2,
      }}
    />
    <div
      style={{
        position: "absolute",
        top: -3,
        left: `calc(${(row.smart_score / 10) * 100}% - 1px)`,
        width: 2,
        height: 10,
        background: "var(--text)",
        borderRadius: 1,
      }}
    />
  </div>
)}
```

Replace the inline `PT $X` span with a hairline chip in the top-right of the headline row (already positioned via `ml-auto`):

```diff
  {row.price_target != null && (
    <span
-     className="font-mono text-[12px] tabular-nums ml-auto"
-     style={{ color: "var(--text)" }}
+     className="font-mono tabular-nums ml-auto"
+     style={{
+       fontSize: 11.5,
+       color: "var(--text-2)",
+       background: "var(--panel-2)",
+       border: "1px solid var(--hairline)",
+       padding: "3px 8px",
+       borderRadius: 6,
+     }}
      title="Tipranks composite price target"
    >
      PT {money(row.price_target)}
    </span>
  )}
```

### W2 · Sentiment

**File**: `SentimentCard.tsx`.

1. **Buzz indicator → hairline chip** (lines ~131-141). Currently a plain text span with no background.
```diff
- <span
-   className="text-[10.5px] tabular-nums"
-   style={{ color: "var(--mute)" }}
-   title={…}
- >
-   Buzz {row.news.buzz.buzz.toFixed(2)}×
- </span>
+ <span
+   className="font-mono tabular-nums"
+   style={{
+     fontSize: 11,
+     color: "var(--text-2)",
+     background: "var(--panel-2)",
+     border: "1px solid var(--hairline)",
+     padding: "2px 7px",
+     borderRadius: 999,
+   }}
+   title={…}
+ >
+   Buzz {row.news.buzz.buzz.toFixed(2)}×
+ </span>
```

2. **Word cloud chips → outlined pills** (lines ~199-211):
```diff
  <span
    key={i}
-   className="text-[10.5px] px-1.5 py-0.5 rounded"
+   className="text-[10.5px]"
    style={{
-     background: "var(--panel-2)",
-     color: "var(--mute)",
+     background: "transparent",
+     border: "1px solid var(--hairline)",
+     color: "var(--text-2)",
+     padding: "2px 8px",
+     borderRadius: 999,
    }}
  >
```

### W3 · Analyst Ratings

**File**: `AnalystRatingsCard.tsx`.

1. **PT label → chip** (lines ~112-118):
```diff
- <span
-   className="text-[11px] font-mono tabular-nums"
-   style={{ color: "var(--text)" }}
-   title="Analyst price target"
- >
-   PT {ptLabel}
- </span>
+ <span
+   className="font-mono tabular-nums"
+   style={{
+     fontSize: 11,
+     color: "var(--text)",
+     background: "var(--panel-2)",
+     border: "1px solid var(--hairline)",
+     padding: "2px 7px",
+     borderRadius: 6,
+   }}
+   title="Analyst price target"
+ >
+   PT {ptLabel}
+ </span>
```

2. **Hit rate → mini bar + value**. Replace the existing single-line "67% hit · +12.4% avg" with a small horizontal bar + two compact numbers:

```tsx
{!dense && stockHit && (
  <span
    className="inline-flex items-center"
    style={{ gap: 6, fontSize: 11 }}
    title={r.stock_total_recommendations != null
      ? `${r.stock_good_recommendations ?? 0} of ${r.stock_total_recommendations} calls on this stock`
      : "Track record on this stock"}
  >
    <span
      aria-hidden
      style={{
        width: 28,
        height: 3,
        background: "var(--panel-2)",
        borderRadius: 2,
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "block",
          width: `${(r.stock_success_rate ?? 0) * 100}%`,
          height: "100%",
          background: hitColor,
          borderRadius: 2,
        }}
      />
    </span>
    <span className="font-mono tabular-nums" style={{ color: hitColor }}>{stockHit}</span>
    {r.stock_avg_return != null && (
      <span className="font-mono tabular-nums" style={{ color: "var(--mute)" }}>
        {r.stock_avg_return > 0 ? "+" : ""}{r.stock_avg_return.toFixed(1)}%
      </span>
    )}
  </span>
)}
```

Where `hitColor` is the existing ternary `r.stock_success_rate >= 0.55 ? var(--pos) : ... var(--mute)` — extract it once above.

### W4 · Hedge Funds

**File**: `HedgeFundsCard.tsx`.

1. **Signal headline bigger** (lines ~163-179):
```diff
  <span
-   className="font-semibold text-[15px]"
+   className="font-semibold"
-   style={{ color: ratingColor(row.signal.rating) }}
+   style={{
+     color: ratingColor(row.signal.rating),
+     fontSize: 19,
+     letterSpacing: "-0.01em",
+   }}
  >
```

2. **Quarterly net Δ → mini bar chart**. Replace the plain "+860K Q3" stack with vertical bars. Compute `maxNet = Math.max(...row.holdings_history.map(h => Math.abs(h.net_shares_change ?? 0)))` above the JSX, then:

```tsx
<div
  style={{
    display: "flex",
    gap: 8,
    alignItems: "flex-end",
    height: 56,
    marginTop: 4,
  }}
>
  {row.holdings_history.slice(narrow ? -2 : -4).map((h) => {
    const v = h.net_shares_change ?? 0;
    const heightPct = maxNet > 0 ? (Math.abs(v) / maxNet) * 100 : 0;
    return (
      <div
        key={h.date}
        style={{
          flex: 1,
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 4,
          minWidth: 0,
        }}
      >
        <span
          className="font-mono tabular-nums truncate"
          style={{ fontSize: 10.5, color: signedColor(v) }}
        >
          {signedCompact(v)}
        </span>
        <div
          style={{
            width: "100%",
            height: 36,
            background: "var(--panel-2)",
            borderRadius: "3px 3px 0 0",
            display: "flex",
            flexDirection: "column",
            justifyContent: "flex-end",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              height: `${heightPct}%`,
              background: v < 0 ? "var(--neg)" : "var(--pos)",
              opacity: 0.85,
              borderRadius: "3px 3px 0 0",
            }}
          />
        </div>
        <span style={{ fontSize: 10, color: "var(--mute)" }}>
          {fmtQuarter(h.date)}
        </span>
      </div>
    );
  })}
</div>
```

The label sits above the bar so positive and negative bars share the same baseline — colour alone signals direction. If you prefer a midline-cross design, take it as a follow-up.

3. **Top stats grid → hairline dividers between cells** (lines ~187-217):
Wrap the 3-col grid in a row with `border-top: 1px solid var(--hairline); border-bottom: 1px solid var(--hairline); padding: 8px 0;` and add right-borders between cells (last cell omitted).

### W5 · Insiders

**File**: `InsidersCard.tsx`.

1. **Net 12-mo flow headline 15 → 22 px** (lines ~239-249):
```diff
  <span
-   className="font-mono text-[15px] tabular-nums"
+   className="font-mono tabular-nums"
    style={{
+     fontSize: 22,
+     fontWeight: 600,
+     lineHeight: 1,
+     letterSpacing: "-0.01em",
      color: signedColor(row.trend),
    }}
```

The 12-mo flow is the widget's headline metric — current 15-px renders no bigger than the secondary stats.

2. **Confidence chip + monthly bars** — covered by U3 and U5 above.

### W6 · Related Tickers

**File**: `RelatedTickersCard.tsx`.

1. **Cohort selector → rail pattern** (lines ~169-191). Currently each cohort is a 2-px-padded text-button with a conditional background. Replace with the segmented-control treatment that matches the prototype's `.rt-cohorts.polish`:

```tsx
<div
  className="inline-flex"
  style={{
    gap: 2,
    padding: 2,
    background: "var(--panel-2)",
    borderRadius: 8,
    alignSelf: "flex-start",
  }}
>
  {availableCohorts.map((c) => (
    <button
      key={c}
      type="button"
      onClick={() => { setCohort(c); setPage(0); }}
      className="cursor-pointer border-0"
      style={{
        fontSize: 11,
        padding: "4px 10px",
        borderRadius: 6,
        background: cohort === c ? "var(--panel)" : "transparent",
        color: cohort === c ? "var(--text)" : "var(--text-2)",
        boxShadow: cohort === c ? "0 0 0 1px var(--border)" : "none",
        fontWeight: cohort === c ? 600 : 500,
      }}
    >
      {COHORT_LABEL[c]}
    </button>
  ))}
</div>
```

2. **Row hover state**. The `<button>` row variant already has `cursor-pointer` but no visual feedback. Add a Tailwind-friendly hover via inline events, or extract `.rt-row` shared CSS in `index.css`:

```css
.rt-row { transition: background .12s; padding: 7px 6px; margin: 0 -6px; border-radius: 6px; }
.rt-row:hover { background: var(--panel-2); }
```

Then drop `rt-row` onto the row container and pad it `-6px` horizontally so the hover background extends visibly into the card padding.

### W7 · Holder Demographics

**File**: `HolderDemographicsCard.tsx`.

1. **Delta arrows on signed rows**. The `signed: true` fields (7d Δ, 30d Δ, Mo. return) currently show just a coloured percentage. Add a small arrow before the number:

```tsx
function signedArrow(n: number | null): string {
  if (n == null || n === 0) return "";
  return n > 0 ? "▴ " : "▾ ";
}

// inside the row:
<span className="font-mono tabular-nums" style={{ color: tone }}>
  {r.signed && (
    <span style={{ fontSize: 9, marginRight: 2, opacity: 0.75 }}>
      {signedArrow(v)}
    </span>
  )}
  {r.fmt(v)}
</span>
```

2. **Coloured cohort top-borders**. Each cohort column gets a 2-px coloured top border so the eye can locate the column without re-reading the label:

```diff
  <div className="flex flex-col gap-1 min-w-0">
    <span className="text-[10px] font-medium uppercase" style={{ … }}>
      {label}
    </span>
+   <div
+     style={{
+       height: 2,
+       borderRadius: 1,
+       marginBottom: 4,
+       background:
+         c.key === "youngest"
+           ? "color-mix(in oklch, var(--accent) 80%, transparent)"
+           : c.key === "eldest"
+             ? "color-mix(in oklch, var(--amber) 80%, transparent)"
+             : "color-mix(in oklch, var(--mute) 100%, transparent)",
+     }}
+     aria-hidden
+   />
    <div className="flex flex-col gap-0.5">
```

Where `--amber` is the new token from U4. The mapping young=accent/mid=mute/eldest=amber preserves a faint warmth-as-age signal without being a literal age gradient.

### W8 · Trending

**File**: `discover/TrendingResearchCard.tsx`.

1. **Consensus → outlined chip** (lines ~46-52):
```diff
  <span
-   className="text-[12px] tabular-nums text-right"
+   className="tabular-nums"
    style={{
+     fontSize: 11,
+     fontWeight: 500,
+     padding: "1px 7px",
+     borderRadius: 999,
      color: consensusColor(r.consensus),
+     background: "color-mix(in oklch, currentColor 10%, transparent)",
+     border: "1px solid color-mix(in oklch, currentColor 25%, transparent)",
    }}
    title="Analyst consensus"
  >
    {consensusLabel(r.consensus)}
  </span>
```

2. **Row hover state** — same approach as W6: add a `.tr-trow` class to the row, define hover in `index.css`.

---

## Design tokens (no new ones except `--amber`)

Everything else uses tokens already defined in `frontend/src/index.css`:

```css
--accent          oklch(74% 0.09 200)         /* primary teal */
--accent-2        oklch(84% 0.06 200)
--accent-bg       oklch(74% 0.09 200 / 0.13)
--pos             oklch(62% 0.14 155)
--neg             oklch(70% 0.18 25)
--text / --text-2 / --mute
--panel / --panel-2 / --panel-3
--border / --border-2 / --hairline
--shadow-sm / --shadow / --shadow-lg
--r (10) / --r-lg (14) / --r-xl (18)
--font-sans (Inter) / --font-mono (IBM Plex Mono)
```

**New token to add to `:root` and `html[data-theme="dark"]` in `index.css`**:

```css
--amber: oklch(78% 0.14 75);
```

Used by U4 (Insiders stars) and W7 (HolderDemographics eldest cohort top-border). Same hue/chroma in both themes — the warm amber reads correctly against both surfaces.

---

## Acceptance checklist

When you've implemented this:

**Header**:
- [ ] On Discover, the active mode pill has a 2-px accent underline 8 px below the text — not a panel-fill segmented control
- [ ] Ask anything is a 260-px-wide search-field-style button with placeholder-style text + a chiselled kbd cap on the right
- [ ] ✦ has a faint teal halo (`drop-shadow` filter)
- [ ] Theme + Settings buttons have no panel fill / border at rest (transparent), reveal on hover
- [ ] Equity value is `font-weight: 550`, day P/L is `font-weight: 500` with a muted bullet separator and proper `−` minus sign
- [ ] A 1-px hairline runs along the bottom of the header band

**TipRanks widgets** (run on a stock with full data — AAPL is a good test):
- [ ] Inner row dividers are noticeably softer than the v0.70 baseline (using `--hairline` not `--border`)
- [ ] Action badges (Upgraded, Maintained, New, Reduced…) render as rounded pills with a 1-px tinted border
- [ ] SmartScore has a gradient gauge rail under the score with a tick at the score position; PT is a corner chip
- [ ] HedgeFunds shows a row of vertical bars for the quarterly net Δ
- [ ] Insiders headline (`−$28.4M` style) is 22-px not 15-px
- [ ] Insiders stars are amber (filled) / `--border-2` (hollow), not all-mute
- [ ] AnalystRatings PT renders as a chip; hit-rate has a tiny horizontal bar before the %
- [ ] RelatedTickers cohort selector is a segmented control (not loose text-buttons)
- [ ] HolderDemographics signed values have ▴/▾ arrows; each cohort column has a coloured 2-px top-border
- [ ] Trending consensus labels are outlined chips with row hover state

---

## Notes for follow-ups (not in scope)

- A `<SectionLabel>`, `<Chip>`, `<MiniBar>` set of shared primitives in `frontend/src/components/research/_shared/` would dedupe a lot of inline-style soup across these 8 widgets. Worth extracting after this lands.
- The current `bare` prop pattern (every widget renders twice — bare body + outer chrome) is fine, but a `<ResearchCard>` wrapper would let the universal sweep (U6) live in one place.
- Mobile / iPad layouts for these widgets (when used outside Workspace, e.g. inline in DiscoverPage) were not in scope and not visually inspected — they may need their own pass.
