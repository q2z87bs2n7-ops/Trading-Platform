// Declarative Workspace control actions — the contract shared by the local
// Ask-anything intent parser, the AI directive path (backend
// `workspace_actions` in the ask response), and the controller that replays
// them against the live canvas. Dependency-free (types only) so both
// `lib/ask-intent.ts` and `lib/workspace/controller.ts` can import it.

import type { AssetClass, Channel } from "./registry";

export type WidgetId =
  | "chart"
  | "minichart"
  | "watchlist"
  | "trade"
  | "account"
  | "positions"
  | "orders"
  | "activity"
  | "news";

export type Arrangement = "grid" | "focus" | "columns" | "rows";
export type Silo = AssetClass;

// A panel in a custom layout. A chart with a `symbol` and no `channel` is a
// standalone (`none`) chart that owns its symbol; otherwise `channel` binds it
// to a shared symbol group.
export interface PanelSpec {
  kind: WidgetId;
  symbol?: string;
  channel?: Channel;
}

export interface LayoutSpec {
  widgets: PanelSpec[];
  arrangement?: Arrangement;
  columns?: number;
}

export type WorkspaceAction =
  | { kind: "set_channel"; channel: Channel; symbol: string }
  | { kind: "add_widget"; widget: WidgetId; symbol?: string; channel?: Channel }
  | { kind: "remove_widget"; widget?: WidgetId; panelId?: string }
  | { kind: "apply_preset"; preset: string }
  | { kind: "build_layout"; spec: LayoutSpec };

// Every action may name a target silo; the controller switches silos first.
export type SiloedAction = WorkspaceAction & { silo?: Silo };

export interface ApplyResult {
  ok: boolean;
  applied: string[];
  error?: string;
}

export const WIDGET_IDS: readonly WidgetId[] = [
  "chart",
  "minichart",
  "watchlist",
  "trade",
  "account",
  "positions",
  "orders",
  "activity",
  "news",
];

// Chart widgets are the only ones that read a per-panel `params.symbol` (the
// standalone `none` case); the builder uses this to decide symbol placement.
export const CHART_WIDGET_IDS: readonly WidgetId[] = ["chart", "minichart"];
