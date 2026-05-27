import { useEffect, useRef, useState } from "react";

import IconButton from "./IconButton";
import { useSettings } from "../hooks/useSettings";
import { updateSettings } from "../lib/settings";
import { disableServiceWorker } from "../lib/service-worker";

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

type AssetClassMode = "stocks" | "crypto" | "forex";

function readSilo(): AssetClassMode {
  const raw = localStorage.getItem("asset_class_mode");
  if (raw === "crypto") return "crypto";
  if (raw === "forex") return "forex";
  return "stocks";
}

// Silo switcher row — matches the ToggleRow rhythm (title + description on
// the left, control on the right) so it reads as a peer of the AI toggles
// rather than a chip floating above them. Dispatches a window event that
// App.tsx listens for; no callback drilling through the header chrome.
function SiloRow({ onClose }: { onClose: () => void }) {
  const current = readSilo();
  function switchTo(silo: AssetClassMode) {
    if (silo === current) {
      onClose();
      return;
    }
    window.dispatchEvent(
      new CustomEvent("trading-platform:switch-silo", { detail: { silo } }),
    );
    onClose();
  }
  return (
    <div
      className="px-3 py-3 flex items-start justify-between gap-3"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-[13px] font-medium">Market</span>
      </div>
      <div
        role="radiogroup"
        aria-label="Active market"
        className="inline-flex shrink-0"
        style={{
          padding: 2,
          borderRadius: 999,
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
        }}
      >
        {(["stocks", "crypto", "forex"] as AssetClassMode[]).map((s) => {
          const active = s === current;
          const tint = s === "stocks" ? "var(--pos)" : s === "forex" ? "oklch(72% 0.18 55)" : "var(--accent)";
          return (
            <button
              key={s}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => switchTo(s)}
              className="text-[12px] font-semibold cursor-pointer border-0 capitalize transition-colors"
              style={{
                background: active ? tint : "transparent",
                color: active ? "white" : "var(--text-2)",
                borderRadius: 999,
                padding: "5px 14px",
              }}
            >
              {s}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// Group label between sections of the settings menu (AI / System / …).
// Thin separator only — the first ToggleRow under each label still draws
// its own top border, so the eye reads section breaks consistently.
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="px-3 pt-3 pb-1 text-[10.5px] uppercase font-semibold"
      style={{ color: "var(--mute)", letterSpacing: "0.06em" }}
    >
      {children}
    </div>
  );
}

function ToggleRow({
  title,
  desc,
  on,
  onChange,
  label,
}: {
  title: string;
  desc: string;
  on: boolean;
  onChange: (next: boolean) => void;
  label: string;
}) {
  return (
    <div
      className="px-3 py-3 flex items-start justify-between gap-3"
      style={{ borderTop: "1px solid var(--hairline)" }}
    >
      <div className="flex flex-col min-w-0">
        <span className="text-[13px] font-medium">{title}</span>
        <span
          className="text-[12px] mt-0.5 leading-snug"
          style={{ color: "var(--mute)" }}
        >
          {desc}
        </span>
      </div>
      <Toggle on={on} onChange={onChange} label={label} />
    </div>
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

  // Listen for the "open Settings" event that AiDisabledNotice's CTA fires —
  // explicit-consent UX: the notice doesn't flip toggles itself, it deposits
  // the user here to do it.
  useEffect(() => {
    function onOpen() {
      setOpen(true);
    }
    window.addEventListener("trading-platform:open-settings", onOpen);
    return () =>
      window.removeEventListener("trading-platform:open-settings", onOpen);
  }, []);

  return (
    <div ref={ref} className="relative">
      <IconButton
        onClick={() => setOpen((v) => !v)}
        active={open}
        aria-label="Open settings"
        aria-haspopup="menu"
        aria-expanded={open}
        className="w-8 h-8 justify-center"
      >
        <GearIcon />
      </IconButton>

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
          <SectionLabel>Market</SectionLabel>

          <SiloRow onClose={() => setOpen(false)} />

          <SectionLabel>AI</SectionLabel>

          <ToggleRow
            title="Market summary AI"
            desc="Auto-generates the per-window market & crypto briefing on Discover. Costs Anthropic credits each new window."
            on={settings.marketSummaryAiEnabled}
            onChange={(v) => updateSettings({ marketSummaryAiEnabled: v })}
            label="Enable AI market summary"
          />

          <ToggleRow
            title="Ask anything AI"
            desc="When on, anything the local parser can't answer is sent to Claude with read access to your account, positions, news and bars. Costs credits per question."
            on={settings.askAiEnabled}
            onChange={(v) => updateSettings({ askAiEnabled: v })}
            label="Enable AI fallback in Ask anything"
          />

          <ToggleRow
            title="ChartBot"
            desc="The violet chart assistant in Chart mode — chat, drawings, studies and order visualisation. Costs credits per message."
            on={settings.chartbotEnabled}
            onChange={(v) => updateSettings({ chartbotEnabled: v })}
            label="Enable ChartBot"
          />

          <SectionLabel>System</SectionLabel>

          <div
            className="px-3 py-3 flex items-center justify-between gap-3"
            style={{ borderTop: "1px solid var(--hairline)" }}
          >
            <span className="text-[13px] font-medium">
              Disable service worker
            </span>
            <button
              type="button"
              onClick={() => void disableServiceWorker()}
              className="text-[12px] font-medium cursor-pointer"
              style={{
                padding: "5px 10px",
                background: "transparent",
                border: "1px solid var(--neg)",
                color: "var(--neg)",
                borderRadius: "var(--r)",
              }}
            >
              Disable
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
