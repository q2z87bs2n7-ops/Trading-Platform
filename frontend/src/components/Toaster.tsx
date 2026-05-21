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

export default function Toaster() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  useEffect(() => subscribeToasts(setToasts), []);

  if (toasts.length === 0) return null;

  return (
    <div
      className="fixed z-50 flex flex-col gap-2"
      style={{ bottom: 16, right: 16, maxWidth: "calc(100vw - 32px)" }}
      aria-live="polite"
      role="status"
    >
      {toasts.map((t) => {
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
    </div>
  );
}
