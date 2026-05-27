import { useEffect, useState } from "react";

import { dismissToast, subscribeToasts, type Toast } from "../lib/toast";

const KIND_STYLE: Record<
  Toast["kind"],
  { color: string; bg: string; border: string; glyph: string }
> = {
  success: {
    color: "var(--pos)",
    bg: "var(--pos-bg)",
    border: "var(--pos)",
    glyph: "✓",
  },
  error: {
    color: "var(--neg)",
    bg: "var(--neg-bg)",
    border: "var(--neg)",
    glyph: "⚠",
  },
  info: {
    color: "var(--text)",
    bg: "var(--panel)",
    border: "var(--border)",
    glyph: "·",
  },
};

const MAX_VISIBLE = 3;

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  // Stack the newest 3 toasts; older ones are summarised by a count badge so
  // bursts (e.g. multiple cancel-all errors) don't push content off-screen.
  const visible = toasts.slice(0, MAX_VISIBLE);
  const overflow = toasts.length - visible.length;

  return (
    <div
      className="fixed z-50 flex flex-col"
      style={{ bottom: 16, right: 16, maxWidth: "calc(100vw - 32px)", gap: 8 }}
      aria-live="polite"
      role="status"
    >
      {visible.map((t) => {
        const s = KIND_STYLE[t.kind];
        return (
          <button
            key={t.id}
            type="button"
            onClick={() => dismissToast(t.id)}
            className="flex items-center gap-2 text-[13px] font-medium cursor-pointer text-left"
            style={{
              padding: "8px 12px",
              background: s.bg,
              color: s.color,
              border: `1px solid ${s.border}`,
              borderRadius: "var(--r)",
              boxShadow: "var(--shadow)",
              minWidth: 220,
              maxWidth: 360,
              animation: "toast-in 180ms ease",
            }}
            aria-label="Dismiss"
          >
            <style>{`@keyframes toast-in{from{transform:translateY(8px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>
            <span aria-hidden>{s.glyph}</span>
            <span>{t.message}</span>
          </button>
        );
      })}
      {overflow > 0 && (
        <div
          className="text-[11.5px] font-medium tabular-nums text-center"
          style={{
            padding: "4px 8px",
            color: "var(--mute)",
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r)",
            boxShadow: "var(--shadow-sm)",
          }}
          aria-label={`${overflow} more notification${overflow === 1 ? "" : "s"}`}
        >
          +{overflow} more
        </div>
      )}
    </div>
  );
}
