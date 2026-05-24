import { useEffect, useRef } from "react";
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
} from "../lib/workspace/registry";

interface Props {
  symbol: string;
  onSelect: (s: string) => void;
  assetClass: AssetClass;
  theme: "light" | "dark";
}

const storageKey = (ac: AssetClass) => `workspace_layout_${ac}_v1`;

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

export default function Workspace({ symbol, onSelect, assetClass, theme }: Props) {
  const apiRef = useRef<DockviewApi | null>(null);
  const disposableRef = useRef<{ dispose: () => void } | null>(null);

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

    disposableRef.current = event.api.onDidLayoutChange(() => {
      try {
        localStorage.setItem(
          storageKey(assetClass),
          JSON.stringify(event.api.toJSON()),
        );
      } catch {
        /* quota / serialization — non-fatal for a layout cache */
      }
    });
  };

  useEffect(() => () => disposableRef.current?.dispose(), []);

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
    <WorkspaceProvider value={{ symbol, setSymbol: onSelect, assetClass }}>
      <div className="flex items-center gap-1.5 flex-wrap mb-2">
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
        <ToolbarButton onClick={resetLayout}>Reset layout</ToolbarButton>
      </div>

      <div
        style={{
          height: "calc(100dvh - 220px)",
          minHeight: 480,
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
    </WorkspaceProvider>
  );
}
