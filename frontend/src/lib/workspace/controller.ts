// Cross-component bridge between the always-mounted Ask-anything bar and the
// lazily-mounted Workspace canvas. A module singleton (same pattern as
// data/quoteStream.ts): the Workspace registers an imperative handle on
// onReady; App registers mode/silo hooks; AskBar calls applyWorkspaceActions().

import type { Channel } from "./registry";
import type {
  ApplyResult,
  LayoutSpec,
  Silo,
  SiloedAction,
  WidgetId,
} from "./actions";

export interface WorkspaceHandle {
  assetClass: Silo;
  setChannelSymbol(channel: Channel, symbol: string): void;
  applyPreset(presetId: string): boolean;
  addWidget(widget: WidgetId, opts?: { symbol?: string; channel?: Channel }): void;
  removeWidget(opts: { widget?: WidgetId; panelId?: string }): boolean;
  buildCustomLayout(spec: LayoutSpec): void;
  panelIds(): string[];
}

export interface AppHooks {
  // Switch to Workspace mode, optionally switching silo first.
  enterWorkspace(silo?: Silo): void;
  getEnv(): { mode: string; assetClass: Silo; isMobile: boolean };
}

let handle: WorkspaceHandle | null = null;
let appHooks: AppHooks | null = null;
let waiters: Array<(h: WorkspaceHandle) => void> = [];

export function registerWorkspace(h: WorkspaceHandle): void {
  handle = h;
  const pending = waiters;
  waiters = [];
  for (const fn of pending) fn(h);
}

export function unregisterWorkspace(h: WorkspaceHandle): void {
  if (handle === h) handle = null;
}

export function registerAppHooks(h: AppHooks): void {
  appHooks = h;
}

// Drop the current handle so awaitHandle() blocks for the next onReady — used
// right before a silo switch remounts the Dockview canvas (key={assetClass}).
function invalidateHandle(): void {
  handle = null;
}

function awaitHandle(timeoutMs = 5000): Promise<WorkspaceHandle> {
  if (handle) return Promise.resolve(handle);
  return new Promise((resolve, reject) => {
    const onReady = (h: WorkspaceHandle) => {
      clearTimeout(timer);
      resolve(h);
    };
    const timer = setTimeout(() => {
      waiters = waiters.filter((w) => w !== onReady);
      reject(new Error("Workspace did not mount in time"));
    }, timeoutMs);
    waiters.push(onReady);
  });
}

export async function applyWorkspaceActions(
  actions: SiloedAction[],
): Promise<ApplyResult> {
  if (!actions.length) return { ok: true, applied: [] };

  const env = appHooks?.getEnv();
  if (!env) return { ok: false, applied: [], error: "Workspace is unavailable." };
  if (env.isMobile) {
    return {
      ok: false,
      applied: [],
      error: "The Workspace is desktop-only — open it on a larger screen.",
    };
  }

  const targetSilo: Silo = actions.find((a) => a.silo)?.silo ?? env.assetClass;
  const willRemount = targetSilo !== env.assetClass || !handle;

  appHooks!.enterWorkspace(targetSilo);
  if (willRemount) invalidateHandle();

  let h: WorkspaceHandle;
  try {
    h = await awaitHandle();
  } catch (e) {
    return { ok: false, applied: [], error: (e as Error).message };
  }

  const applied: string[] = [];
  for (const a of actions) {
    try {
      switch (a.kind) {
        case "set_channel": {
          const sym = a.symbol.toUpperCase();
          h.setChannelSymbol(a.channel, sym);
          applied.push(`Set ${a.channel} → ${sym}`);
          break;
        }
        case "add_widget":
          h.addWidget(a.widget, { symbol: a.symbol, channel: a.channel });
          applied.push(`Added ${a.widget}${a.symbol ? ` · ${a.symbol.toUpperCase()}` : ""}`);
          break;
        case "remove_widget":
          if (h.removeWidget({ widget: a.widget, panelId: a.panelId })) {
            applied.push(`Removed ${a.widget ?? a.panelId ?? "widget"}`);
          }
          break;
        case "apply_preset":
          applied.push(
            h.applyPreset(a.preset)
              ? `Applied ${a.preset} layout`
              : `Unknown layout "${a.preset}"`,
          );
          break;
        case "build_layout":
          h.buildCustomLayout(a.spec);
          applied.push(`Built a ${a.spec.widgets.length}-panel layout`);
          break;
      }
    } catch (e) {
      applied.push(`Failed: ${(e as Error).message}`);
    }
  }
  return { ok: true, applied };
}
