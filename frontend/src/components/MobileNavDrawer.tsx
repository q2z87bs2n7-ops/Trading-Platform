import { useEffect, type ReactNode } from "react";
import { useTheme } from "../hooks/useTheme";
import { useSettings } from "../hooks/useSettings";
import { updateSettings } from "../lib/settings";
import { disableServiceWorker } from "../lib/service-worker";

interface Props {
  open: boolean;
  onClose: () => void;
  onOpenHub: () => void;
  version: string;
}

export default function MobileNavDrawer({ open, onClose, onOpenHub, version }: Props) {
  const { theme, toggle: toggleTheme } = useTheme();
  const settings = useSettings();

  // ESC + body-scroll lock when open. Pattern lifted from CmdBar.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      className="fixed inset-0 z-50"
      style={{ background: "rgba(20,22,28,0.45)" }}
      onClick={onClose}
    >
      <aside
        onClick={(e) => e.stopPropagation()}
        style={{
          position: "absolute",
          left: 0,
          top: 0,
          bottom: 0,
          width: "min(84vw, 360px)",
          background: "var(--panel)",
          borderRight: "1px solid var(--border)",
          boxShadow: "var(--shadow-lg)",
          paddingTop: "calc(var(--safe-top) + 16px)",
          paddingBottom: "calc(var(--safe-bottom) + 16px)",
          paddingLeft: 16,
          paddingRight: 16,
          display: "flex",
          flexDirection: "column",
          gap: 12,
          animation: "mob-drawer-in 200ms ease",
        }}
      >
        {/* Brand row */}
        <button
          type="button"
          onClick={() => {
            onOpenHub();
            onClose();
          }}
          className="flex items-center gap-3 bg-transparent border-0 cursor-pointer text-left"
        >
          <div
            aria-hidden
            style={{
              width: 40,
              height: 40,
              borderRadius: 12,
              background: "linear-gradient(135deg, var(--accent), var(--accent-2))",
              color: "#fff",
              display: "grid",
              placeItems: "center",
              fontWeight: 700,
              fontSize: 16,
            }}
          >
            ◆
          </div>
          <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.1 }}>
            <span style={{ fontSize: 16, fontWeight: 600 }}>Trading Platform</span>
            <span
              style={{ fontSize: 12, color: "var(--mute)", fontFamily: "var(--font-mono)" }}
            >
              v{version} · paper
            </span>
          </div>
        </button>

        <div style={{ height: 1, background: "var(--hairline)", margin: "4px -16px" }} />

        <DrawerItem
          icon="◇"
          label="Account hub"
          onClick={() => {
            onOpenHub();
            onClose();
          }}
        />

        <DrawerItem
          icon={theme === "dark" ? "☀" : "☾"}
          label={`Theme — ${theme}`}
          onClick={toggleTheme}
        />

        <DrawerItem
          icon="✦"
          label="AI Ask anything"
          right={settings.cmdbarAiEnabled ? "On" : "Off"}
          onClick={() => updateSettings({ cmdbarAiEnabled: !settings.cmdbarAiEnabled })}
        />

        <DrawerItem
          icon="⟳"
          label="Disable service worker"
          onClick={() => void disableServiceWorker()}
        />

        <div
          style={{
            marginTop: "auto",
            fontSize: 11,
            color: "var(--mute)",
            lineHeight: 1.5,
          }}
        >
          Paper trading via Alpaca. Single user; keys server-side only.
        </div>
      </aside>
      <style>{`@keyframes mob-drawer-in { from { transform: translateX(-100%) } to { transform: none } }`}</style>
    </div>
  );
}

function DrawerItem({
  icon,
  label,
  right,
  onClick,
}: {
  icon: string;
  label: string;
  right?: ReactNode;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-3 cursor-pointer text-left"
      style={{
        background: "var(--panel-2)",
        border: "1px solid var(--border)",
        borderRadius: 10,
        padding: "12px 14px",
        fontSize: 14,
        minHeight: "var(--mob-tap)",
        color: "var(--text)",
      }}
    >
      <span aria-hidden style={{ width: 24, textAlign: "center" }}>
        {icon}
      </span>
      <span style={{ flex: 1 }}>{label}</span>
      {right && <span style={{ fontSize: 12, color: "var(--mute)" }}>{right}</span>}
    </button>
  );
}
