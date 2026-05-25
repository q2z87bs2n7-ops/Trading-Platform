// Build a custom Dockview layout from a declarative spec. Uses the same
// imperative `api.clear()` + chained `api.addPanel({ position })` technique the
// named presets use (see presets.tsx) — Dockview has no reliable size hints, so
// even cells fall out of the split topology. Column count is responsive to the
// viewport aspect ratio unless the spec pins it.

import type { DockviewApi } from "dockview-react";
import { WIDGET_TITLES } from "./registry";
import { CHART_WIDGET_IDS, type LayoutSpec, type PanelSpec } from "./actions";

type AddOpts = Parameters<DockviewApi["addPanel"]>[0];

const MAX_PANELS = 12;

function responsiveColumns(n: number): number {
  if (n <= 1) return 1;
  const ar =
    typeof window !== "undefined"
      ? window.innerWidth / Math.max(1, window.innerHeight)
      : 1.6;
  const ideal = Math.round(Math.sqrt(n * ar));
  return Math.max(1, Math.min(n, ideal));
}

function columnsFor(spec: LayoutSpec): number {
  const n = spec.widgets.length;
  if (n <= 1) return 1;
  if (spec.columns && spec.columns > 0) return Math.min(spec.columns, n);
  switch (spec.arrangement) {
    case "columns":
      return n;
    case "rows":
      return 1;
    default:
      return responsiveColumns(n);
  }
}

// A chart with an explicit symbol and no requested channel becomes standalone
// (`none`, owns its symbol). Otherwise honour the requested channel (default
// `main`); a channel-bound chart still carries its seed symbol in params.
function panelParams(w: PanelSpec): Record<string, unknown> {
  const isChart = CHART_WIDGET_IDS.includes(w.kind);
  if (isChart && w.symbol && !w.channel) {
    return { channel: "none", symbol: w.symbol };
  }
  const params: Record<string, unknown> = { channel: w.channel ?? "main" };
  if (isChart && w.symbol) params.symbol = w.symbol;
  return params;
}

export function buildCustomLayout(api: DockviewApi, spec: LayoutSpec): void {
  api.clear();
  const widgets = spec.widgets.slice(0, MAX_PANELS);
  if (widgets.length === 0) return;
  const stamp = Date.now();

  // Focus: one large panel left, the rest stacked down the right column.
  if (spec.arrangement === "focus" && widgets.length > 1) {
    const [first, ...rest] = widgets;
    const firstId = `${first.kind}-0-${stamp}`;
    api.addPanel({
      id: firstId,
      component: first.kind,
      title: WIDGET_TITLES[first.kind],
      params: panelParams(first),
    } as AddOpts);
    let prevRightId: string | null = null;
    rest.forEach((w, i) => {
      const id = `${w.kind}-${i + 1}-${stamp}`;
      const position: AddOpts["position"] = prevRightId
        ? { referencePanel: prevRightId, direction: "below" }
        : { referencePanel: firstId, direction: "right" };
      api.addPanel({
        id,
        component: w.kind,
        title: WIDGET_TITLES[w.kind],
        position,
        params: panelParams(w),
      } as AddOpts);
      prevRightId = id;
    });
    return;
  }

  // Grid / columns / rows: build row-major, splitting right within a row and
  // below to start each new row.
  const cols = columnsFor(spec);
  const ids: string[] = [];
  widgets.forEach((w, i) => {
    const id = `${w.kind}-${i}-${stamp}`;
    const col = i % cols;
    const row = Math.floor(i / cols);
    let position: AddOpts["position"];
    if (i === 0) position = undefined;
    else if (col === 0) position = { referencePanel: ids[(row - 1) * cols], direction: "below" };
    else position = { referencePanel: ids[i - 1], direction: "right" };
    api.addPanel({
      id,
      component: w.kind,
      title: WIDGET_TITLES[w.kind],
      position,
      params: panelParams(w),
    } as AddOpts);
    ids.push(id);
  });
}
