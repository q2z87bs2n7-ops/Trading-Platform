import {
  useEffect,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from "react";
import { createRoot, type Root } from "react-dom/client";
import { GoldenLayout, type LayoutConfig } from "golden-layout";
import type { IDockviewPanelProps } from "dockview-react";
import "golden-layout/dist/css/goldenlayout-base.css";
import "golden-layout/dist/css/themes/goldenlayout-light-theme.css";
import "./workspace-golden.css";
import {
  WorkspaceProvider,
  WIDGET_COMPONENTS,
  WIDGET_TITLES,
  CHANNEL_META,
  SYMBOL_CHANNELS,
  type AssetClass,
  type Channel,
} from "../lib/workspace/registry";
import EngineToggle from "../lib/workspace/EngineToggle";

// ---------------------------------------------------------------------------
// PROTOTYPE — Golden Layout canvas, evaluated against the production Dockview
// Workspace via the toolbar engine toggle. Reuses the real widget components
// (lib/workspace/registry) through a Dockview-props shim. Intentionally narrow:
// builds the Trader preset on load; layout + per-panel channel are not yet
// persisted (channel SYMBOLS are, shared with Dockview). Not the reuse pattern
// of record — throwaway until the engine decision lands.
// ---------------------------------------------------------------------------

interface Props {
  symbol: string;
  onSelect: (s: string) => void;
  assetClass: AssetClass;
  theme: "light" | "dark";
  focus: boolean;
  onToggleFocus: () => void;
}

// Duplicated (minimal) from Workspace.tsx so the prototype shares the same
// per-silo channel symbols (localStorage `workspace_channels_v1`) — flip the
// blue channel in one engine and the other agrees.
const CHANNELS_KEY = "workspace_channels_v1";
const CHANNEL_DEFAULTS: Record<AssetClass, Partial<Record<Channel, string>>> = {
  stocks: { main: "TSLA", blue: "AAPL", green: "NVDA", amber: "AMZN" },
  crypto: { main: "BTC/USD", blue: "ETH/USD", green: "XRP/USD", amber: "SOL/USD" },
};

type ChannelSymbols = Record<string, string>;

function loadChannelSymbols(ac: AssetClass): ChannelSymbols {
  try {
    const raw = localStorage.getItem(CHANNELS_KEY);
    if (raw) {
      const all = JSON.parse(raw) as Partial<Record<AssetClass, ChannelSymbols>>;
      return { ...(all[ac] ?? {}) };
    }
  } catch {
    /* ignore malformed cache */
  }
  return {};
}

// Snapshot is replaced (new identity) on every mutation so useSyncExternalStore
// consumers re-render and re-read getSymbol.
interface Snap {
  channelSymbols: ChannelSymbols;
  panelChannels: Record<string, Channel>;
  main: string;
}

interface WsStore {
  subscribe: (cb: () => void) => () => void;
  getSnapshot: () => Snap;
  getSymbol: (channel: Channel) => string;
  setSymbol: (channel: Channel, sym: string) => void;
  registerPanelChannel: (panelId: string, channel: Channel) => void;
  unregisterPanelChannel: (panelId: string) => void;
  setMain: (symbol: string, onSelect: (s: string) => void) => void;
}

function createStore(assetClass: AssetClass): WsStore {
  let snap: Snap = {
    channelSymbols: loadChannelSymbols(assetClass),
    panelChannels: {},
    main: "",
  };
  let onSelectMain: (s: string) => void = () => {};
  const listeners = new Set<() => void>();
  const emit = () => listeners.forEach((l) => l());

  const getSymbol = (channel: Channel): string => {
    if (channel === "none") return "";
    const def = CHANNEL_DEFAULTS[assetClass][channel] ?? "";
    if (channel === "main") return snap.main || def;
    return snap.channelSymbols[channel] || def;
  };

  return {
    subscribe: (cb) => {
      listeners.add(cb);
      return () => listeners.delete(cb);
    },
    getSnapshot: () => snap,
    getSymbol,
    setSymbol: (channel, sym) => {
      if (channel === "none") return;
      if (channel === "main") {
        onSelectMain(sym);
        return;
      }
      const channelSymbols = { ...snap.channelSymbols, [channel]: sym };
      snap = { ...snap, channelSymbols };
      try {
        const raw = localStorage.getItem(CHANNELS_KEY);
        const all = raw ? JSON.parse(raw) : {};
        all[assetClass] = channelSymbols;
        localStorage.setItem(CHANNELS_KEY, JSON.stringify(all));
      } catch {
        /* quota — non-fatal */
      }
      emit();
    },
    registerPanelChannel: (panelId, channel) => {
      if (snap.panelChannels[panelId] === channel) return;
      snap = {
        ...snap,
        panelChannels: { ...snap.panelChannels, [panelId]: channel },
      };
      emit();
    },
    unregisterPanelChannel: (panelId) => {
      if (!(panelId in snap.panelChannels)) return;
      const panelChannels = { ...snap.panelChannels };
      delete panelChannels[panelId];
      snap = { ...snap, panelChannels };
      emit();
    },
    setMain: (symbol, onSelect) => {
      onSelectMain = onSelect;
      if (snap.main === symbol) return;
      snap = { ...snap, main: symbol };
      emit();
    },
  };
}

// Builds the minimal IDockviewPanelProps the real widgets touch: props.params
// (channel/symbol seed) and props.api.{id, updateParameters}. Everything else
// on the Dockview surface is unused by the widgets, so a cast is safe here.
function GoldenPanel({
  widgetId,
  panelId,
  initialParams,
}: {
  widgetId: string;
  panelId: string;
  initialParams: Record<string, unknown>;
}) {
  const [params, setParams] = useState<Record<string, unknown>>(
    () => ({ ...initialParams }),
  );
  const props = useMemo(() => {
    const api = {
      id: panelId,
      updateParameters: (p: Record<string, unknown>) =>
        setParams((prev) => ({ ...prev, ...p })),
    };
    return { params, api } as unknown as IDockviewPanelProps;
  }, [params, panelId]);

  const Comp = WIDGET_COMPONENTS[widgetId];
  if (!Comp) return null;
  return <Comp {...props} />;
}

// One React root per Golden Layout panel. Subscribes to the store so a channel
// symbol change anywhere re-renders the widget (the WorkspaceCtx value identity
// changes with each snapshot, forcing consumers to re-read getSymbol).
function PanelRoot({
  store,
  assetClass,
  widgetId,
  panelId,
  initialParams,
}: {
  store: WsStore;
  assetClass: AssetClass;
  widgetId: string;
  panelId: string;
  initialParams: Record<string, unknown>;
}) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const ctx = useMemo(
    () => ({
      assetClass,
      getSymbol: store.getSymbol,
      setSymbol: store.setSymbol,
      registerPanelChannel: store.registerPanelChannel,
      unregisterPanelChannel: store.unregisterPanelChannel,
    }),
    // snap identity drives the re-render; the functions are stable.
    [snap, assetClass, store],
  );
  return (
    <WorkspaceProvider value={ctx}>
      <GoldenPanel
        widgetId={widgetId}
        panelId={panelId}
        initialParams={initialParams}
      />
    </WorkspaceProvider>
  );
}

// Trader preset, mirrored from lib/workspace/presets (Dockview) into a Golden
// Layout config tree. componentType matches WIDGET_COMPONENTS keys.
const TRADER_CONFIG: LayoutConfig = {
  settings: {
    showPopoutIcon: true,
    showMaximiseIcon: true,
    showCloseIcon: true,
    constrainDragToContainer: false,
  },
  dimensions: { headerHeight: 28, borderWidth: 6 },
  root: {
    type: "row",
    content: [
      {
        type: "column",
        width: 66,
        content: [
          { type: "component", componentType: "chart", title: "Chart", height: 64 },
          {
            type: "stack",
            height: 36,
            content: [
              { type: "component", componentType: "news", title: "News" },
              { type: "component", componentType: "activity", title: "Activity" },
            ],
          },
        ],
      },
      {
        type: "column",
        width: 34,
        content: [
          {
            type: "stack",
            height: 52,
            content: [
              { type: "component", componentType: "trade", title: "Trade" },
              { type: "component", componentType: "account", title: "Account" },
            ],
          },
          { type: "component", componentType: "positions", title: "Positions", height: 24 },
          { type: "component", componentType: "orders", title: "Orders", height: 24 },
        ],
      },
    ],
  },
};

function GoldenChannelsStrip({ store }: { store: WsStore }) {
  const snap = useSyncExternalStore(store.subscribe, store.getSnapshot);
  const counts = useMemo(() => {
    const c: Record<Channel, number> = {
      none: 0, main: 0, blue: 0, green: 0, amber: 0,
    };
    for (const ch of Object.values(snap.panelChannels)) c[ch] += 1;
    return c;
  }, [snap]);
  return (
    <div
      className="flex items-center gap-2"
      style={{
        padding: "4px 8px",
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderRadius: "var(--r)",
        height: 32,
        boxSizing: "border-box",
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: "var(--mute)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        Channels
      </span>
      {SYMBOL_CHANNELS.map((ch) => {
        const meta = CHANNEL_META[ch];
        const isMain = ch === "main";
        return (
          <span
            key={ch}
            className="inline-flex items-center gap-1.5"
            style={{ fontSize: 11, fontFamily: "var(--font-mono)", color: "var(--text)" }}
          >
            <span
              aria-hidden
              style={{
                width: 9,
                height: 9,
                borderRadius: "50%",
                background: isMain ? "transparent" : meta.color,
                border: isMain ? "2px solid var(--mute)" : "0",
                boxSizing: "border-box",
              }}
            />
            {store.getSymbol(ch) || "—"}
            {counts[ch] > 0 && (
              <span style={{ color: "var(--mute)", fontSize: 10 }}>{counts[ch]}</span>
            )}
          </span>
        );
      })}
    </div>
  );
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
      className="text-[12px] px-2.5 py-1 rounded-card cursor-pointer transition-colors"
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        color: "var(--text-2)",
        fontWeight: 500,
      }}
    >
      {children}
    </button>
  );
}

export default function WorkspaceGolden({
  symbol,
  onSelect,
  assetClass,
  focus,
  onToggleFocus,
}: Props) {
  const hostRef = useRef<HTMLDivElement>(null);
  const layoutRef = useRef<GoldenLayout | null>(null);
  const rootsRef = useRef<Map<HTMLElement, Root>>(new Map());
  const store = useMemo(() => createStore(assetClass), [assetClass]);

  // Keep the store's "main" channel pointed at the app's selected symbol.
  useEffect(() => {
    store.setMain(symbol, onSelect);
  }, [symbol, onSelect, store]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const layout = new GoldenLayout(host);
    layoutRef.current = layout;
    let seq = 0;

    for (const widgetId of Object.keys(WIDGET_COMPONENTS)) {
      layout.registerComponentFactoryFunction(widgetId, (container, state) => {
        const panelId = `${widgetId}-${++seq}`;
        const root = createRoot(container.element);
        rootsRef.current.set(container.element, root);
        root.render(
          <PanelRoot
            store={store}
            assetClass={assetClass}
            widgetId={widgetId}
            panelId={panelId}
            initialParams={(state as Record<string, unknown>) ?? {}}
          />,
        );
        container.on("destroy", () => {
          const r = rootsRef.current.get(container.element);
          rootsRef.current.delete(container.element);
          // Defer so unmount doesn't run during GL's synchronous teardown.
          if (r) setTimeout(() => r.unmount(), 0);
        });
      });
    }

    layout.resizeWithContainerAutomatically = true;
    layout.loadLayout(TRADER_CONFIG);

    return () => {
      const roots = rootsRef.current;
      layout.destroy();
      for (const r of roots.values()) setTimeout(() => r.unmount(), 0);
      roots.clear();
      layoutRef.current = null;
    };
  }, [store, assetClass]);

  function addWidget(id: string) {
    layoutRef.current?.addComponent(id, undefined, WIDGET_TITLES[id] ?? id);
  }

  function resetLayout() {
    layoutRef.current?.loadLayout(TRADER_CONFIG);
  }

  return (
    <div style={{ flex: 1, minHeight: 0, display: "flex", flexDirection: "column" }}>
      <div
        className="flex items-center gap-2 flex-wrap shrink-0"
        style={{ marginBottom: 8 }}
      >
        <EngineToggle />
        <span
          style={{
            fontSize: 10,
            color: "var(--mute)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
            fontWeight: 600,
          }}
        >
          Prototype
        </span>
        <GoldenChannelsStrip store={store} />
        <div className="flex-1" />
        <ToolbarButton onClick={() => addWidget("chart")}>+ Chart</ToolbarButton>
        <ToolbarButton onClick={() => addWidget("trade")}>+ Trade</ToolbarButton>
        <ToolbarButton onClick={() => addWidget("profile")}>+ Profile</ToolbarButton>
        <ToolbarButton onClick={resetLayout}>Reset</ToolbarButton>
        <ToolbarButton onClick={onToggleFocus}>
          {focus ? "Exit focus" : "Focus"}
        </ToolbarButton>
      </div>

      <div
        style={{
          flex: 1,
          minHeight: 0,
          border: "1px solid var(--border)",
          borderRadius: "var(--r)",
          overflow: "hidden",
          position: "relative",
        }}
      >
        <div ref={hostRef} className="ws-golden" />
      </div>
    </div>
  );
}
