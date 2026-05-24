import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
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
  WIDGET_GROUPS,
  WIDGET_TITLES,
  WidgetIcon,
  TabWithChannel,
  CHANNEL_META,
  SYMBOL_CHANNELS,
  type AssetClass,
  type Channel,
  type WidgetGroup,
} from "../lib/workspace/registry";
import { AssetSearch } from "./AssetSearch";

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

type ToolbarVariant = "ghost" | "default";

function ToolbarButton({
  onClick,
  children,
  active,
  ariaPressed,
  variant = "default",
}: {
  onClick: () => void;
  children: React.ReactNode;
  active?: boolean;
  ariaPressed?: boolean;
  variant?: ToolbarVariant;
}) {
  const ghost = variant === "ghost";
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={ariaPressed}
      className="text-[12px] px-2.5 py-1 rounded-card cursor-pointer transition-colors"
      style={{
        background: ghost ? "transparent" : "var(--panel-2)",
        border: ghost ? "1px solid transparent" : "1px solid var(--border)",
        color: active ? "var(--text)" : "var(--text-2)",
        fontWeight: active ? 600 : 500,
      }}
      onMouseEnter={(e) => {
        if (ghost) e.currentTarget.style.background = "var(--panel-2)";
      }}
      onMouseLeave={(e) => {
        if (ghost) e.currentTarget.style.background = "transparent";
      }}
    >
      {children}
    </button>
  );
}

// Primary CTA — accent-filled "+ Add widget" button (replaces today's muted
// "+ Add ▾" pill). Used by the toolbar.
function AddWidgetButton({ onClick, buttonRef }: {
  onClick: () => void;
  buttonRef?: React.Ref<HTMLButtonElement>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      className="text-[12px] cursor-pointer rounded-card"
      style={{
        background: "var(--accent)",
        color: "#fff",
        fontWeight: 600,
        border: "1px solid transparent",
        boxShadow: "0 1px 2px rgba(20,22,28,0.10)",
        padding: "5px 10px",
      }}
    >
      <span style={{ marginRight: 4, fontSize: 13, fontWeight: 700 }}>+</span>
      Add widget
    </button>
  );
}

// Hook: pin a popover anchored to an element ref against the viewport. Same
// clamp-to-viewport pattern as before, now reusable for both the Add menu and
// per-chip AssetSearch popovers in the Channels strip.
function useAnchoredPopover(
  anchorRef: React.RefObject<HTMLElement | null>,
  width: number,
  open: boolean,
) {
  const [pos, setPos] = useState({ top: 0, left: 0 });
  useEffect(() => {
    if (!open) return;
    const update = () => {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const left = Math.max(8, Math.min(r.left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 4, left });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, anchorRef, width]);
  return pos;
}

// v2 Add menu — 320px popover with a search input, grouped sections, icons and
// one-line descriptions. Portaled to <body> so the full-bleed canvas can't
// clip it. Keyboard: ↑/↓ to move, Enter to add, Esc to close.
function AddWidgetMenu({ onAdd }: { onAdd: (id: string) => void }) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [hoverIdx, setHoverIdx] = useState(0);
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const pos = useAnchoredPopover(btnRef, 320, open);

  const q = query.trim().toLowerCase();
  const filtered = useMemo(
    () =>
      WIDGET_CATALOG.filter(
        (w) =>
          !q ||
          w.title.toLowerCase().includes(q) ||
          w.desc.toLowerCase().includes(q),
      ),
    [q],
  );

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (menuRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (open) {
      setQuery("");
      setHoverIdx(0);
      requestAnimationFrame(() => inputRef.current?.focus());
    }
  }, [open]);

  function pick(id: string) {
    onAdd(id);
    setOpen(false);
  }

  function onKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") {
      setOpen(false);
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHoverIdx((i) => Math.min(filtered.length - 1, i + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHoverIdx((i) => Math.max(0, i - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const w = filtered[hoverIdx];
      if (w) pick(w.id);
    }
  }

  return (
    <>
      <AddWidgetButton onClick={() => setOpen((o) => !o)} buttonRef={btnRef} />
      {open &&
        createPortal(
          <div
            ref={menuRef}
            onKeyDown={onKeyDown}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 320,
              zIndex: 1000,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 10,
              boxShadow: "var(--shadow-lg)",
              padding: 6,
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "6px 8px",
                margin: "2px 2px 6px",
                background: "var(--panel-2)",
                borderRadius: 6,
                border: "1px solid var(--border)",
              }}
            >
              <svg
                width={13}
                height={13}
                viewBox="0 0 16 16"
                fill="none"
                stroke="var(--mute)"
                strokeWidth="1.4"
                strokeLinecap="round"
                aria-hidden
              >
                <circle cx="7" cy="7" r="4" />
                <path d="M10 10 L13.5 13.5" />
              </svg>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={(e) => {
                  setQuery(e.target.value);
                  setHoverIdx(0);
                }}
                placeholder="Search widgets…"
                style={{
                  flex: 1,
                  background: "transparent",
                  border: 0,
                  outline: "none",
                  fontSize: 12,
                  color: "var(--text)",
                }}
              />
              <span
                style={{
                  color: "var(--mute)",
                  fontSize: 10,
                  fontFamily: "var(--font-mono)",
                }}
              >
                ↵
              </span>
            </div>

            {filtered.length === 0 && (
              <div
                style={{
                  padding: "12px 10px",
                  color: "var(--mute)",
                  fontSize: 12,
                }}
              >
                No widgets match "{query}".
              </div>
            )}

            {WIDGET_GROUPS.map((g: WidgetGroup) => {
              const items = filtered.filter((w) => w.group === g);
              if (items.length === 0) return null;
              return (
                <div key={g}>
                  <div
                    style={{
                      fontSize: 10,
                      textTransform: "uppercase",
                      letterSpacing: "0.08em",
                      color: "var(--mute)",
                      fontWeight: 600,
                      padding: "8px 10px 4px",
                    }}
                  >
                    {g}
                  </div>
                  {items.map((w) => {
                    const idx = filtered.indexOf(w);
                    const active = idx === hoverIdx;
                    return (
                      <button
                        key={w.id}
                        type="button"
                        onClick={() => pick(w.id)}
                        onMouseEnter={() => setHoverIdx(idx)}
                        style={{
                          display: "flex",
                          alignItems: "flex-start",
                          gap: 10,
                          width: "100%",
                          padding: "7px 10px",
                          borderRadius: 6,
                          border: "none",
                          background: active ? "var(--panel-2)" : "transparent",
                          cursor: "pointer",
                          textAlign: "left",
                        }}
                      >
                        <span
                          style={{
                            width: 28,
                            height: 28,
                            background: "var(--panel-2)",
                            borderRadius: 6,
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            color: "var(--text-2)",
                            flexShrink: 0,
                          }}
                        >
                          <WidgetIcon path={w.iconPath} />
                        </span>
                        <span
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            minWidth: 0,
                          }}
                        >
                          <span
                            style={{
                              fontSize: 12.5,
                              fontWeight: 600,
                              color: "var(--text)",
                              lineHeight: 1.3,
                            }}
                          >
                            {w.title}
                          </span>
                          <span
                            style={{
                              fontSize: 11,
                              color: "var(--mute)",
                              lineHeight: 1.4,
                              marginTop: 1,
                            }}
                          >
                            {w.desc}
                          </span>
                        </span>
                      </button>
                    );
                  })}
                </div>
              );
            })}
          </div>,
          document.body,
        )}
    </>
  );
}

// Per-channel chip in the toolbar Channels strip: a colour dot, the live
// symbol on that channel, a count badge of how many widgets are currently
// linked. Clicking opens an AssetSearch popover anchored to the chip.
function ChannelChip({
  channel,
  symbol,
  count,
  assetClass,
  onPickSymbol,
}: {
  channel: Channel;
  symbol: string;
  count: number;
  assetClass: AssetClass;
  onPickSymbol: (sym: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPopover(ref, 280, open);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  const meta = CHANNEL_META[channel];
  const isMain = channel === "main";
  const hasSymbol = symbol.length > 0;

  return (
    <>
      <button
        ref={ref}
        type="button"
        onClick={() => setOpen((o) => !o)}
        title={`Set symbol on ${meta.label} channel`}
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 6,
          padding: "3px 8px 3px 4px",
          borderRadius: 999,
          background: "var(--panel-2)",
          border: "1px solid transparent",
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text)",
          cursor: "pointer",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--panel-3)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "var(--panel-2)";
        }}
      >
        <span
          aria-hidden
          style={{
            width: 10,
            height: 10,
            borderRadius: "50%",
            background: isMain ? "transparent" : meta.color,
            border: isMain ? "2px solid var(--mute)" : "0",
            boxSizing: "border-box",
            flexShrink: 0,
          }}
        />
        <span style={{ color: hasSymbol ? "var(--text)" : "var(--mute)" }}>
          {hasSymbol ? symbol : "—"}
        </span>
        {count > 0 && (
          <span
            style={{
              color: "var(--mute)",
              fontSize: 10,
              paddingLeft: 2,
              fontFamily: "var(--font-sans)",
            }}
          >
            {count}
          </span>
        )}
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 280,
              zIndex: 1000,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "var(--shadow-lg)",
              padding: 8,
            }}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
            }}
          >
            <AssetSearch
              assetClass={assetClass === "crypto" ? "crypto" : "us_equity"}
              align="left"
              autoFocus
              fluid
              onChoose={(s) => {
                onPickSymbol(s);
                setOpen(false);
              }}
            />
          </div>,
          document.body,
        )}
    </>
  );
}

// Toolbar Channels strip — one chip per symbol channel (main + colours) plus a
// "CHANNELS" eyebrow. Chip counts come from a live panel→channel map.
function ChannelsStrip({
  assetClass,
  getSymbol,
  setSymbol,
  counts,
}: {
  assetClass: AssetClass;
  getSymbol: (channel: Channel) => string;
  setSymbol: (channel: Channel, sym: string) => void;
  counts: Record<Channel, number>;
}) {
  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 6,
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
          paddingRight: 4,
        }}
      >
        Channels
      </span>
      {SYMBOL_CHANNELS.map((ch) => (
        <ChannelChip
          key={ch}
          channel={ch}
          symbol={getSymbol(ch)}
          count={counts[ch] ?? 0}
          assetClass={assetClass}
          onPickSymbol={(s) => setSymbol(ch, s)}
        />
      ))}
    </div>
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

  // panelId → current channel. Each widget's useChannel reports up here so the
  // Channels strip can show a live "widgets bound to each channel" count;
  // Dockview emits no params-changed event, so we track it ourselves.
  const [panelChannels, setPanelChannels] = useState<Record<string, Channel>>({});
  const registerPanelChannel = useCallback((panelId: string, channel: Channel) => {
    setPanelChannels((p) => (p[panelId] === channel ? p : { ...p, [panelId]: channel }));
  }, []);
  const unregisterPanelChannel = useCallback((panelId: string) => {
    setPanelChannels((p) => {
      if (!(panelId in p)) return p;
      const next = { ...p };
      delete next[panelId];
      return next;
    });
  }, []);
  const channelCounts = useMemo(() => {
    const counts: Record<Channel, number> = {
      none: 0, main: 0, blue: 0, green: 0, amber: 0,
    };
    for (const ch of Object.values(panelChannels)) counts[ch] += 1;
    return counts;
  }, [panelChannels]);

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
      registerPanelChannel,
      unregisterPanelChannel,
    }),
    [
      assetClass,
      symbol,
      channelSymbols,
      onSelect,
      registerPanelChannel,
      unregisterPanelChannel,
    ],
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
        <div
          className="flex items-center gap-2 flex-wrap shrink-0"
          style={{ marginBottom: 8 }}
        >
          <AddWidgetMenu onAdd={addWidget} />
          <ChannelsStrip
            assetClass={assetClass}
            getSymbol={workspaceCtx.getSymbol}
            setSymbol={workspaceCtx.setSymbol}
            counts={channelCounts}
          />
          <div className="flex-1" />
          <ToolbarButton variant="ghost" onClick={onToggleFocus}>
            {focus ? "Exit focus" : "Focus"}
          </ToolbarButton>
          <ToolbarButton
            variant="ghost"
            onClick={toggleTabs}
            active={!tabsHidden}
            ariaPressed={!tabsHidden}
          >
            Tab bars
          </ToolbarButton>
          <ToolbarButton variant="ghost" onClick={resetLayout}>
            Reset layout
          </ToolbarButton>
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
            tabComponents={{ default: TabWithChannel }}
            defaultTabComponent="default"
            onReady={onReady}
            theme={theme === "dark" ? themeDark : themeLight}
          />
        </div>
      </div>
    </WorkspaceProvider>
  );
}
