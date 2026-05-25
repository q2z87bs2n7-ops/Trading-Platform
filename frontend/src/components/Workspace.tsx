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
import {
  PRESETS,
  DEFAULT_PRESET,
  applyPreset,
  type LayoutPreset,
} from "../lib/workspace/presets";
import { buildCustomLayout as buildLayout } from "../lib/workspace/build";
import {
  registerWorkspace,
  unregisterWorkspace,
  type WorkspaceHandle,
} from "../lib/workspace/controller";

interface Props {
  symbol: string;
  onSelect: (s: string) => void;
  assetClass: AssetClass;
  theme: "light" | "dark";
  focus: boolean;
  onToggleFocus: () => void;
}

const STORAGE_KEY_V1 = (ac: AssetClass) => `workspace_layout_${ac}_v1`;
const STORAGE_KEY_V2 = (ac: AssetClass) => `workspace_layouts_${ac}_v2`;

// v2 persistence shape: an active layout (currently displayed; may equal a
// preset's output plus any subsequent dragging) plus a slot for future named
// user layouts ("Save current as…"). The v2 shape is forward-compatible so
// the named-layouts UI can ship later without another migration.
interface SavedLayouts {
  active: { name: string; layout: unknown };
  saved: Record<string, unknown>;
}

function loadLayouts(ac: AssetClass): SavedLayouts | null {
  try {
    const v2raw = localStorage.getItem(STORAGE_KEY_V2(ac));
    if (v2raw) return JSON.parse(v2raw) as SavedLayouts;
    // First load after upgrade: migrate v1 → v2 and drop v1.
    const v1raw = localStorage.getItem(STORAGE_KEY_V1(ac));
    if (v1raw) {
      const migrated: SavedLayouts = {
        active: { name: "default", layout: JSON.parse(v1raw) },
        saved: {},
      };
      localStorage.setItem(STORAGE_KEY_V2(ac), JSON.stringify(migrated));
      localStorage.removeItem(STORAGE_KEY_V1(ac));
      return migrated;
    }
  } catch {
    /* malformed cache — fall through to a fresh layout */
  }
  return null;
}

function saveActiveLayout(ac: AssetClass, layout: unknown, name?: string) {
  try {
    const cur = loadLayouts(ac) ?? {
      active: { name: "default", layout: null },
      saved: {},
    };
    cur.active = { name: name ?? cur.active.name ?? "default", layout };
    localStorage.setItem(STORAGE_KEY_V2(ac), JSON.stringify(cur));
  } catch {
    /* quota / serialization — non-fatal for a layout cache */
  }
}

function clearActiveLayout(ac: AssetClass) {
  try {
    localStorage.removeItem(STORAGE_KEY_V2(ac));
  } catch {
    /* non-fatal */
  }
}

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

// First-run / Reset → run the default preset's build (see lib/workspace/
// presets.tsx). buildDefaultLayout used to live here; the body moved to
// PRESETS["trader"].build verbatim so reset behaviour is unchanged.

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
// clip it. Keyboard: ↑/↓ to move, Enter to add, Esc to close. `openRef` is
// populated with an imperative open() so non-toolbar callers (the empty
// state) can trigger the popover.
function AddWidgetMenu({
  onAdd,
  openRef,
}: {
  onAdd: (id: string) => void;
  openRef?: React.MutableRefObject<(() => void) | null>;
}) {
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

  useEffect(() => {
    if (!openRef) return;
    openRef.current = () => setOpen(true);
    return () => {
      if (openRef.current) openRef.current = null;
    };
  }, [openRef]);

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
              display: "flex",
              flexDirection: "column",
              maxHeight: `calc(100vh - ${pos.top + 8}px)`,
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
                flexShrink: 0,
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

            <div style={{ overflowY: "auto", flex: "1 1 auto", minHeight: 0 }}>
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
            </div>
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

// Toolbar Layouts menu — opens a 480px popover showing preset cards (Trader /
// Researcher / Watcher / Focus) with sketched thumbnails, descriptions, and
// badges. Selecting a card highlights it; Apply replaces the canvas. Applying
// is destructive, hence the explicit confirm step.
function LayoutsMenu({
  onApply,
  openRef,
}: {
  onApply: (preset: LayoutPreset) => void;
  openRef?: React.MutableRefObject<(() => void) | null>;
}) {
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState<string>(PRESETS[0].id);
  const btnRef = useRef<HTMLButtonElement>(null);
  const popRef = useRef<HTMLDivElement>(null);
  const pos = useAnchoredPopover(btnRef, 480, open);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (btnRef.current?.contains(t)) return;
      if (popRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  useEffect(() => {
    if (!openRef) return;
    openRef.current = () => setOpen(true);
    return () => {
      if (openRef.current) openRef.current = null;
    };
  }, [openRef]);

  function commit() {
    const p = PRESETS.find((x) => x.id === selectedId);
    if (p) onApply(p);
    setOpen(false);
  }

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="text-[12px] px-2.5 py-1 rounded-card cursor-pointer transition-colors"
        style={{
          background: "transparent",
          border: "1px solid transparent",
          color: "var(--text-2)",
          fontWeight: 500,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.background = "var(--panel-2)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.background = "transparent";
        }}
      >
        Layouts ▾
      </button>
      {open &&
        createPortal(
          <div
            ref={popRef}
            onKeyDown={(e) => {
              if (e.key === "Escape") setOpen(false);
              if (e.key === "Enter") commit();
            }}
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: 480,
              zIndex: 1000,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              boxShadow: "var(--shadow-lg)",
              padding: 16,
            }}
          >
            <div style={{ marginBottom: 12 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 600,
                  color: "var(--text)",
                }}
              >
                Choose a layout
              </div>
              <div
                style={{
                  fontSize: 11,
                  color: "var(--mute)",
                  marginTop: 2,
                }}
              >
                Applying replaces the current arrangement.
              </div>
            </div>

            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {PRESETS.map((p) => {
                const isSel = p.id === selectedId;
                return (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => setSelectedId(p.id)}
                    onDoubleClick={() => {
                      setSelectedId(p.id);
                      commit();
                    }}
                    style={{
                      background: "var(--panel)",
                      border: `1px solid ${isSel ? "var(--accent)" : "var(--border)"}`,
                      borderRadius: 12,
                      padding: 14,
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 10,
                      textAlign: "left",
                      boxShadow: isSel
                        ? "0 0 0 1px var(--accent-bg)"
                        : "none",
                    }}
                  >
                    <div
                      style={{
                        height: 110,
                        background: "var(--panel-2)",
                        borderRadius: 8,
                        padding: 6,
                      }}
                    >
                      {p.thumbnail()}
                    </div>
                    <div
                      style={{
                        fontSize: 13,
                        fontWeight: 600,
                        color: "var(--text)",
                      }}
                    >
                      {p.title}
                    </div>
                    <div
                      style={{
                        fontSize: 11,
                        color: "var(--mute)",
                        lineHeight: 1.4,
                      }}
                    >
                      {p.desc}
                    </div>
                    <div style={{ display: "flex", gap: 4, flexWrap: "wrap" }}>
                      {p.badges.map((b) => (
                        <span
                          key={b}
                          style={{
                            fontSize: 10,
                            padding: "2px 6px",
                            borderRadius: 4,
                            background: "var(--panel-2)",
                            color: "var(--text-2)",
                          }}
                        >
                          {b}
                        </span>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: 8,
                marginTop: 14,
              }}
            >
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-[12px] cursor-pointer rounded-card"
                style={{
                  background: "transparent",
                  border: "1px solid transparent",
                  color: "var(--text-2)",
                  padding: "5px 10px",
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={commit}
                className="text-[12px] cursor-pointer rounded-card"
                style={{
                  background: "var(--accent)",
                  color: "#fff",
                  fontWeight: 600,
                  border: "1px solid transparent",
                  padding: "5px 12px",
                }}
              >
                Apply layout
              </button>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}

// Centred empty-state overlay shown when the canvas has zero panels. Sits
// inside the (positioned) Dockview container so it tracks resizes.
function EmptyState({
  onAdd,
  onBrowseLayouts,
}: {
  onAdd: () => void;
  onBrowseLayouts: () => void;
}) {
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        padding: 32,
        background: "var(--panel-2)",
        zIndex: 1,
      }}
    >
      <svg
        width={28}
        height={28}
        viewBox="0 0 16 16"
        fill="none"
        stroke="var(--mute)"
        strokeWidth="1.4"
        strokeLinecap="round"
        aria-hidden
      >
        <path d="M8 3 V13 M3 8 H13" />
      </svg>
      <div
        style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}
      >
        Your workspace is empty
      </div>
      <div
        style={{
          fontSize: 13,
          color: "var(--mute)",
          maxWidth: 380,
          textAlign: "center",
        }}
      >
        Add a widget to get started, or pick a layout.
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        <button
          type="button"
          onClick={onAdd}
          className="text-[12px] cursor-pointer rounded-card"
          style={{
            background: "var(--accent)",
            color: "#fff",
            fontWeight: 600,
            border: "1px solid transparent",
            padding: "6px 12px",
          }}
        >
          + Add widget
        </button>
        <button
          type="button"
          onClick={onBrowseLayouts}
          className="text-[12px] cursor-pointer rounded-card"
          style={{
            background: "transparent",
            color: "var(--text-2)",
            border: "1px solid var(--border)",
            padding: "6px 12px",
          }}
        >
          Browse layouts
        </button>
      </div>
    </div>
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
  const handleRef = useRef<WorkspaceHandle | null>(null);
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

  // Keep a live ref to the context so the imperative handle (built once in
  // onReady) always reads the current onSelect / channel symbols.
  const ctxRef = useRef(workspaceCtx);
  ctxRef.current = workspaceCtx;

  // Drives the empty-state overlay. -1 = not yet measured (avoids a flash of
  // empty state before onReady runs the first-run preset). Updated from
  // Dockview's panel add/remove events.
  const [panelCount, setPanelCount] = useState(-1);
  const panelEventsRef = useRef<{ dispose: () => void }[]>([]);

  const onReady = (event: DockviewReadyEvent) => {
    apiRef.current = event.api;
    disposableRef.current?.dispose();

    const saved = loadLayouts(assetClass);
    let restored = false;
    if (saved?.active?.layout) {
      try {
        // Stored opaquely as `unknown` in v2 shape — the runtime shape is
        // whatever the last `api.toJSON()` produced.
        event.api.fromJSON(saved.active.layout as Parameters<DockviewApi["fromJSON"]>[0]);
        restored = true;
      } catch {
        clearActiveLayout(assetClass);
      }
    }
    if (!restored) DEFAULT_PRESET.build(event.api);
    setPanelCount(event.api.panels.length);

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

    // Track panel count for the empty-state overlay.
    for (const d of panelEventsRef.current) d.dispose();
    panelEventsRef.current = [
      event.api.onDidAddPanel(() => setPanelCount(event.api.panels.length)),
      event.api.onDidRemovePanel(() => setPanelCount(event.api.panels.length)),
    ];

    // Debounced — onDidLayoutChange fires rapidly during a drag/resize; only
    // serialize + write to localStorage once the gesture settles.
    disposableRef.current = event.api.onDidLayoutChange(() => {
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
      }
      saveTimerRef.current = window.setTimeout(() => {
        saveActiveLayout(assetClass, event.api.toJSON());
      }, 400);
    });

    // Imperative handle for the Ask-anything controller bridge. Built once per
    // mount (silo remounts via key={assetClass}, so `assetClass` here is current).
    const handle: WorkspaceHandle = {
      assetClass,
      setChannelSymbol: (channel, sym) => ctxRef.current.setSymbol(channel, sym),
      applyPreset: (presetId) => {
        const p = PRESETS.find((x) => x.id === presetId);
        if (!p) return false;
        applyLayoutPreset(p);
        return true;
      },
      addWidget: (id, opts) => {
        const api = apiRef.current;
        if (!api) return;
        const isChart = id === "chart" || id === "minichart";
        // A channel-linked widget reads its symbol from the channel (not params),
        // so point the channel at the requested instrument or the panel shows
        // whatever the channel already held.
        if (opts?.symbol && opts?.channel && opts.channel !== "none") {
          ctxRef.current.setSymbol(opts.channel, opts.symbol);
        }
        const params: Record<string, unknown> = {};
        if (opts?.channel) params.channel = opts.channel;
        else if (isChart && opts?.symbol) params.channel = "none";
        if (isChart && opts?.symbol) params.symbol = opts.symbol;
        api.addPanel({
          id: `${id}-${Date.now()}`,
          component: id,
          title: WIDGET_TITLES[id],
          params: Object.keys(params).length ? params : undefined,
        });
        saveActiveLayout(assetClass, api.toJSON());
        setPanelCount(api.panels.length);
      },
      removeWidget: ({ widget, panelId }) => {
        const api = apiRef.current;
        if (!api) return false;
        let panel = panelId
          ? api.panels.find((p) => p.id === panelId)
          : undefined;
        if (!panel && widget) {
          const matches = api.panels.filter(
            (p) => p.id === widget || p.id.startsWith(`${widget}-`),
          );
          panel = matches[matches.length - 1];
        }
        if (!panel) return false;
        api.removePanel(panel);
        saveActiveLayout(assetClass, api.toJSON());
        setPanelCount(api.panels.length);
        return true;
      },
      buildCustomLayout: (spec) => {
        const api = apiRef.current;
        if (!api) return;
        clearActiveLayout(assetClass);
        // Seed channel symbols from the spec: channel-linked panels (profiles
        // always, channel-bound charts) take their symbol from the channel, so a
        // requested instrument is lost unless we point the channel at it. A chart
        // carrying a symbol with a channel thus drives every widget on that
        // channel (e.g. a paired chart + profile column).
        for (const w of spec.widgets) {
          if (w.symbol && w.channel && w.channel !== "none") {
            ctxRef.current.setSymbol(w.channel, w.symbol);
          }
        }
        buildLayout(api, spec);
        saveActiveLayout(assetClass, api.toJSON(), "custom");
        setPanelCount(api.panels.length);
      },
      panelIds: () => apiRef.current?.panels.map((p) => p.id) ?? [],
    };
    handleRef.current = handle;
    registerWorkspace(handle);
  };

  useEffect(
    () => () => {
      disposableRef.current?.dispose();
      addGroupDisposableRef.current?.dispose();
      for (const d of panelEventsRef.current) d.dispose();
      panelEventsRef.current = [];
      if (saveTimerRef.current !== undefined) {
        window.clearTimeout(saveTimerRef.current);
      }
      if (handleRef.current) unregisterWorkspace(handleRef.current);
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

  function applyLayoutPreset(preset: LayoutPreset) {
    const api = apiRef.current;
    if (!api) return;
    clearActiveLayout(assetClass);
    applyPreset(api, preset);
    saveActiveLayout(assetClass, api.toJSON(), preset.id);
    setPanelCount(api.panels.length);
  }

  const openAddRef = useRef<(() => void) | null>(null);
  const openLayoutsRef = useRef<(() => void) | null>(null);

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
          <AddWidgetMenu onAdd={addWidget} openRef={openAddRef} />
          <ChannelsStrip
            assetClass={assetClass}
            getSymbol={workspaceCtx.getSymbol}
            setSymbol={workspaceCtx.setSymbol}
            counts={channelCounts}
          />
          <div className="flex-1" />
          <LayoutsMenu onApply={applyLayoutPreset} openRef={openLayoutsRef} />
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
          {/* key by silo so switching reloads that silo's saved layout */}
          <DockviewReact
            key={assetClass}
            components={WIDGET_COMPONENTS}
            defaultTabComponent={TabWithChannel}
            onReady={onReady}
            theme={theme === "dark" ? themeDark : themeLight}
          />
          {panelCount === 0 && (
            <EmptyState
              onAdd={() => openAddRef.current?.()}
              onBrowseLayouts={() => openLayoutsRef.current?.()}
            />
          )}
        </div>
      </div>
    </WorkspaceProvider>
  );
}
