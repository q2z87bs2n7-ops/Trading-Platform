import { useEffect, useRef, useState } from "react";

import { useSettings } from "../hooks/useSettings";
import { updateSettings } from "../lib/settings";

function GearIcon() {
  return (
    <svg
      width={16}
      height={16}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09a1.65 1.65 0 0 0-1-1.51 1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09a1.65 1.65 0 0 0 1.51-1 1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33h0a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51h0a1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82v0a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

function Toggle({
  on,
  onChange,
  label,
}: {
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
      className="inline-flex items-center cursor-pointer border-0"
      style={{
        width: 36,
        height: 20,
        borderRadius: 999,
        background: on ? "var(--accent)" : "var(--panel-3)",
        padding: 2,
        transition: "background 0.15s",
      }}
      aria-label={label}
    >
      <span
        style={{
          width: 16,
          height: 16,
          background: "var(--panel)",
          borderRadius: "50%",
          transform: on ? "translateX(16px)" : "translateX(0)",
          transition: "transform 0.15s",
        }}
      />
    </button>
  );
}

export default function SettingsMenu() {
  const settings = useSettings();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Open settings"
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-8 h-8 flex items-center justify-center rounded-card bg-transparent cursor-pointer"
        style={{
          boxShadow: "inset 0 0 0 1px var(--border)",
          color: open ? "var(--accent)" : "var(--text-2)",
        }}
      >
        <GearIcon />
      </button>

      {open && (
        <div
          className="absolute z-30 mt-2 right-0"
          style={{
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: "var(--r-lg)",
            boxShadow: "var(--shadow-lg)",
            width: 320,
            padding: 4,
          }}
          role="menu"
        >
          <div
            className="px-3 py-2 text-[11px] uppercase font-semibold"
            style={{ color: "var(--mute)", letterSpacing: "0.04em" }}
          >
            Settings
          </div>

          <div
            className="px-3 py-3 flex items-start justify-between gap-3"
            style={{ borderTop: "1px solid var(--hairline)" }}
          >
            <div className="flex flex-col min-w-0">
              <span className="text-[13px] font-medium">⌘K AI fallback</span>
              <span
                className="text-[12px] mt-0.5 leading-snug"
                style={{ color: "var(--mute)" }}
              >
                When on, anything ⌘K can't answer locally is sent to Claude
                with read access to your account, positions, news, and bars.
                Costs Anthropic credits per question.
              </span>
            </div>
            <Toggle
              on={settings.cmdbarAiEnabled}
              onChange={(v) => updateSettings({ cmdbarAiEnabled: v })}
              label="Enable AI fallback in the command bar"
            />
          </div>
        </div>
      )}
    </div>
  );
}
