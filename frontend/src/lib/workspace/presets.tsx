import type { CSSProperties, ReactNode } from "react";
import type { DockviewApi } from "dockview-react";

// Layout presets — named, opinionated canvas arrangements built by an
// imperative `addPanel` sequence. Each preset is `clear()`-then-`build()`
// from the Layouts menu; the first-run fallback uses the default preset
// (Trader). Channel seeds in `params` flow through useChannel on mount.
export interface LayoutPreset {
  id: string;
  title: string;
  desc: string;
  badges: string[];
  /** Tiny SVG/CSS-grid sketch of the layout for the menu card. */
  thumbnail: () => ReactNode;
  build: (api: DockviewApi) => void;
}

const cell = (extra: CSSProperties = {}): CSSProperties => ({
  background: "var(--panel-3)",
  borderRadius: 4,
  ...extra,
});

export const PRESETS: LayoutPreset[] = [
  {
    id: "trader",
    title: "Trader",
    desc:
      "Large chart, trade ticket, positions and orders. Close to today's default.",
    badges: ["Chart", "Trade", "Positions", "Orders"],
    thumbnail: () => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gridTemplateRows: "1fr 1fr 1fr",
          gap: 4,
          height: "100%",
        }}
      >
        <div style={{ gridColumn: "1", gridRow: "1 / span 2", ...cell() }} />
        <div style={{ gridColumn: "1", gridRow: "3", ...cell() }} />
        <div style={{ gridColumn: "2", gridRow: "1", ...cell() }} />
        <div style={{ gridColumn: "2", gridRow: "2", ...cell() }} />
        <div style={{ gridColumn: "2", gridRow: "3", ...cell() }} />
      </div>
    ),
    build: (api) => {
      api.addPanel({ id: "chart", component: "chart", title: "Chart" });
      api.addPanel({
        id: "positions",
        component: "positions",
        title: "Positions",
        position: { referencePanel: "chart", direction: "right" },
      });
      api.addPanel({
        id: "trade",
        component: "trade",
        title: "Trade",
        position: { referencePanel: "positions", direction: "within" },
      });
      api.addPanel({
        id: "account",
        component: "account",
        title: "Account",
        position: { referencePanel: "positions", direction: "within" },
      });
      api.addPanel({
        id: "orders",
        component: "orders",
        title: "Orders",
        position: { referencePanel: "positions", direction: "below" },
      });
      api.addPanel({
        id: "news",
        component: "news",
        title: "News",
        position: { referencePanel: "chart", direction: "below" },
      });
      api.addPanel({
        id: "activity",
        component: "activity",
        title: "Activity",
        position: { referencePanel: "news", direction: "within" },
      });
    },
  },
  {
    id: "researcher",
    title: "Researcher",
    desc:
      "Four charts on a 2×2 grid plus a watchlist and a symbol profile + fundamentals + earnings — compare across the four channels.",
    badges: ["4× Chart", "Watchlist", "Profile", "Fundamentals", "Earnings"],
    thumbnail: () => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "1fr 1fr 1fr",
          gridTemplateRows: "1fr 1fr",
          gap: 4,
          height: "100%",
        }}
      >
        <div style={cell()} />
        <div style={cell()} />
        <div style={{ gridColumn: "3", gridRow: "1", ...cell() }} />
        <div style={{ gridColumn: "3", gridRow: "2", ...cell() }} />
        <div style={cell()} />
        <div style={cell()} />
      </div>
    ),
    build: (api) => {
      api.addPanel({
        id: "chart-tl",
        component: "chart",
        title: "Chart 1",
        params: { channel: "main" },
      });
      api.addPanel({
        id: "chart-tr",
        component: "chart",
        title: "Chart 2",
        position: { referencePanel: "chart-tl", direction: "right" },
        params: { channel: "blue" },
      });
      api.addPanel({
        id: "chart-bl",
        component: "chart",
        title: "Chart 3",
        position: { referencePanel: "chart-tl", direction: "below" },
        params: { channel: "green" },
      });
      api.addPanel({
        id: "chart-br",
        component: "chart",
        title: "Chart 4",
        position: { referencePanel: "chart-tr", direction: "below" },
        params: { channel: "amber" },
      });
      api.addPanel({
        id: "watchlist",
        component: "watchlist",
        title: "Watchlist",
        position: { referencePanel: "chart-br", direction: "right" },
        params: { channel: "main" },
      });
      api.addPanel({
        id: "profile",
        component: "profile",
        title: "Profile",
        position: { referencePanel: "watchlist", direction: "below" },
        params: { channel: "main" },
      });
      api.addPanel({
        id: "fundamentals",
        component: "fundamentals",
        title: "Fundamentals",
        position: { referencePanel: "profile", direction: "within" },
        params: { channel: "main" },
      });
      api.addPanel({
        id: "earnings",
        component: "earnings",
        title: "Earnings",
        position: { referencePanel: "profile", direction: "within" },
        params: { channel: "main" },
      });
    },
  },
  {
    id: "watcher",
    title: "Watcher",
    desc:
      "Six mini-charts, news and account. Pre-open and post-market scanning.",
    badges: ["6× Mini chart", "News", "Account"],
    thumbnail: () => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(4, 1fr)",
          gridTemplateRows: "1fr 1fr",
          gap: 4,
          height: "100%",
        }}
      >
        <div style={cell()} />
        <div style={cell()} />
        <div style={cell()} />
        <div style={cell()} />
        <div style={cell()} />
        <div style={cell()} />
        <div style={cell()} />
        <div style={cell()} />
      </div>
    ),
    build: (api) => {
      api.addPanel({
        id: "mc-1",
        component: "minichart",
        title: "Mini 1",
        params: { channel: "main" },
      });
      api.addPanel({
        id: "mc-2",
        component: "minichart",
        title: "Mini 2",
        position: { referencePanel: "mc-1", direction: "right" },
        params: { channel: "blue" },
      });
      api.addPanel({
        id: "mc-3",
        component: "minichart",
        title: "Mini 3",
        position: { referencePanel: "mc-2", direction: "right" },
        params: { channel: "green" },
      });
      api.addPanel({
        id: "mc-4",
        component: "minichart",
        title: "Mini 4",
        position: { referencePanel: "mc-1", direction: "below" },
        params: { channel: "amber" },
      });
      api.addPanel({
        id: "mc-5",
        component: "minichart",
        title: "Mini 5",
        position: { referencePanel: "mc-2", direction: "below" },
        params: { channel: "main" },
      });
      api.addPanel({
        id: "mc-6",
        component: "minichart",
        title: "Mini 6",
        position: { referencePanel: "mc-3", direction: "below" },
        params: { channel: "blue" },
      });
      api.addPanel({
        id: "news",
        component: "news",
        title: "News",
        position: { referencePanel: "mc-3", direction: "right" },
      });
      api.addPanel({
        id: "account",
        component: "account",
        title: "Account",
        position: { referencePanel: "news", direction: "below" },
      });
    },
  },
  {
    id: "focus",
    title: "Focus",
    desc:
      "One chart, one ticket. Distraction-free for the moment you're putting size on.",
    badges: ["Chart", "Trade"],
    thumbnail: () => (
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2fr 1fr",
          gap: 4,
          height: "100%",
        }}
      >
        <div style={cell()} />
        <div style={cell()} />
      </div>
    ),
    build: (api) => {
      api.addPanel({ id: "chart", component: "chart", title: "Chart" });
      api.addPanel({
        id: "trade",
        component: "trade",
        title: "Trade",
        position: { referencePanel: "chart", direction: "right" },
      });
    },
  },
];

export const DEFAULT_PRESET_ID = "trader";
export const DEFAULT_PRESET: LayoutPreset = PRESETS.find(
  (p) => p.id === DEFAULT_PRESET_ID,
)!;

// Clear the canvas and run the preset's imperative build. The caller is
// responsible for persistence (onDidLayoutChange will fire after addPanel
// calls and the debounced save will pick it up).
export function applyPreset(api: DockviewApi, preset: LayoutPreset) {
  api.clear();
  preset.build(api);
}
