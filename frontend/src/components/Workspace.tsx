import { useEffect, useMemo, useRef, useState } from "react";
import {
  DockviewReact,
  themeLight,
  themeDark,
  type DockviewApi,
  type DockviewReadyEvent,
} from "dockview-react";
import "dockview-react/dist/styles/dockview.css";
import {
  WorkspaceProvider,
  WIDGET_COMPONENTS,
  WIDGET_CATALOG,
  WIDGET_TITLES,
  type AssetClass,
  type Channel,
} from "../lib/workspace/registry";

interface Props {
  symbol: string;
  onSelect: (s: string) => void;
  assetClass: AssetClass;
  theme: "light" | "dark";
  focus: boolean;
  onToggleFocus: () => void;
}

const storageKey = (ac: AssetClass) => `workspace_layout_${ac}_v1`;

// Per-silo colour-channel symbols persisted in one localStorage object.
const CHANNELS_KEY = "workspace_channels_v1";
type SiloChannels = Record<AssetClass, Record<string, string>>;

// Seed symbols for each link channel, per silo (main + the three colours).
const CHANNEL_DEFAULTS: Record<AssetClass, Partial<Record<Channel, string>>> = {
  stocks: { main: "TSLA", blue: "AAPL", green: "NVDA", amber: "AMZN" },
  crypto: { main: "BTC/USD", blue: "ETH/USD", green: "XRP/USD", amber: "SOL/USD" },
};

function loadChannels(): SiloChannels {
  const empty: SiloChannels = { stocks: {}, crypto: {} };
  try {
    const raw = localStorage.getItem(CHANNELS_KEY);
    if (raw) return { ...empty, ...(JSON.parse(raw) as Partial<SiloChannels>) };
  } catch {
    /* ignore malformed cache */
  }
  return empty;
}

// Toggle the tab/header bar on every group (Dockview reclaims the space).
function setAllHeaders(api: DockviewApi, hidden: boolean) {
  for (const g of api.groups) g.model.header.hidden = hidden;
}

// First-run arrangement: chart + news/activity (tab-stacked) on the left,
// positions over orders on the right. Tab-stacking shows the "layer the
// tools" behaviour out of the box.
function buildDefaultLayout(api: DockviewApi) {
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
}

function ToolbarButton({
  onClick,
  children,
}: {
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-[12px] font-medium px-2.5 py-1 rounded-card cursor-pointer transition-colors"
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
      }}
    >
      {children}
    </button>
  );
}

export default function Workspace({
  symbol,
  onSelect,
  assetClass,
  theme,
  focus,
  onToggleFocus,
}: Props) {
  const apiRef = useRef<DockviewApi | null>(null);
  const disposableRef = useRef<{ dispose: () => void } | null>(null);
  const addGroupDisposableRef = useRef<{ dispose: () => void } | null>(null);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const [tabsHidden, setTabsHidden] = useState(false);
  const tabsHiddenRef = useRef(false);

  // Per-channel symbol, persisted locally per silo. "main" proxies the app's
  // selected symbol (so Chart mode etc. stay in sync); the colour channels are
  // seeded from CHANNEL_DEFAULTS and persist user picks across reloads.
  const [channelSymbols, setChannelSymbols] = useState<SiloChannels>(loadChannels);
  const workspaceCtx = useMemo(
    () => ({
      assetClass,
      getSymbol: (channel: Channel) => {
        if (channel === "none") return "";
        const def = CHANNEL_DEFAULTS[assetClass][channel] ?? "";
        if (channel === "main") return symbol || def;
        return channelSymbols[assetClass][channel] || def;
      },
      setSymbol: (channel: Channel, sym: string) => {
        if (channel === "none") return;
        if (channel === "main") {
          onSelect(sym);
          return;
        }
        setChannelSymbols((p) => {
          const next: SiloChannels = {
            ...p,
            [assetClass]: { ...p[assetClass], [channel]: sym },
          };
          try {
            localStorage.setItem(CHANNELS_KEY, JSON.stringify(next));
          } catch {
            /* quota — non-fatal */
          }
          return next;
        });
      },
    }),
    [assetClass, symbol, channelSymbols, onSelect],
  );

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    disposableRef.current?.dispose();

    const saved = localStorage.getItem(storageKey(assetClass));
    let restored = false;
    if (saved) {
      try {
        event.api.fromJSON(JSON.parse(saved));
        restored = true;
      } catch {
        localStorage.removeItem(storageKey(assetClass));
      }
    }
    if (!restored) buildDefaultLayout(event.api);

    // Sync the tab-visibility toggle with the (possibly restored) groups, then
    // keep newly-created groups in step with it.
    addGroupDisposableRef.current?.dispose();
    const hidden =
      event.api.groups.length > 0 &&
      event.api.groups.every((g) => g.model.header.hidden);
    tabsHiddenRef.current = hidden;
    setTabsHidden(hidden);
    addGroupDisposableRef.current = event.api.onDidAddGroup((g) => {
      g.model.header.hidden = tabsHiddenRef.current;
    });

    // Debounced — onDidLayoutChange fires rapidly during a drag/resize; only
    // serialize + write to localStorage once the gesture settles.
    disposableRef.current = event.api.onDidLayoutChange(() => {
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        try {
          localStorage.setItem(
            storageKey(assetClass),
            JSON.stringify(event.api.toJSON()),
          );
        } catch {
          /* quota / serialization — non-fatal for a layout cache */
        }
      }, 400);
    });
  };

  useEffect(
    () => () => {
      disposableRef.current?.dispose();
      addGroupDisposableRef.current?.dispose();
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
      }
    },
    [],
  );

  function toggleTabs() {
    const api = apiRef.current;
    if (!api) return;
    const next = !tabsHiddenRef.current;
    tabsHiddenRef.current = next;
    setTabsHidden(next);
    setAllHeaders(api, next);
  }

  function addWidget(id: string) {
    apiRef.current?.addPanel({
      id: `${id}-${Date.now()}`,
      component: id,
      title: WIDGET_TITLES[id],
    });
  }

  function resetLayout() {
    const api = apiRef.current;
    if (!api) return;
    localStorage.removeItem(storageKey(assetClass));
    api.clear();
    buildDefaultLayout(api);
  }

  return (
    <WorkspaceProvider value={workspaceCtx}>
      <div
        style={{
          flex: 1,
          minHeight: 0,
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div className="flex items-center gap-1.5 flex-wrap mb-2 shrink-0">
          <span
            className="text-[11px] font-semibold uppercase tracking-wide mr-1"
            style={{ color: "var(--mute)" }}
          >
            Add
          </span>
          {WIDGET_CATALOG.map((w) => (
            <ToolbarButton key={w.id} onClick={() => addWidget(w.id)}>
              + {w.title}
            </ToolbarButton>
          ))}
          <div className="flex-1" />
          <ToolbarButton onClick={onToggleFocus}>
            {focus ? "Exit focus" : "Focus"}
          </ToolbarButton>
          <ToolbarButton onClick={toggleTabs}>
            {tabsHidden ? "Show tabs" : "Hide tabs"}
          </ToolbarButton>
          <ToolbarButton onClick={resetLayout}>Reset layout</ToolbarButton>
        </div>

        <div
          style={{
            flex: 1,
            minHeight: 0,
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            overflow: "hidden",
          }}
        >
          {/* key by silo so switching reloads that silo's saved layout */}
          <DockviewReact
            key={assetClass}
            components={WIDGET_COMPONENTS}
            onReady={onReady}
            theme={theme === "dark" ? themeDark : themeLight}
          />
        </div>
      </div>
    </WorkspaceProvider>
  );
}
