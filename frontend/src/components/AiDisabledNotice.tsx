// Friendly inline blocker shown when a given AI surface is switched off in
// Settings. Container-agnostic (renders its own host-tinted left rail and
// "Turn on" CTA) so each consumer just drops it into the surface's chrome.

export type AiSurface = "market" | "ask" | "chartbot";

const COPY: Record<
  AiSurface,
  { title: string; body: string; cost: string }
> = {
  market: {
    title: "Market summary",
    body: "Auto-generated briefings of what moved during the session.",
    cost: "~$0.001 per generation",
  },
  ask: {
    title: "Ask anything",
    body: "Free-form questions — answers, suggestions, layout builds.",
    cost: "free for local intents · ~$0.005 for AI answers",
  },
  chartbot: {
    title: "ChartBot",
    body: "Chart-aware assistant: chat, draw lines, place orders inline.",
    cost: "~$0.002 per turn",
  },
};

export default function AiDisabledNotice({
  surface,
  accent = "var(--accent)",
  compact = false,
}: {
  surface: AiSurface;
  accent?: string;
  compact?: boolean;
}) {
  const c = COPY[surface];
  return (
    <div
      className="flex items-start gap-3 w-full"
      style={{
        padding: compact ? "10px 12px 10px 9px" : "16px 18px 16px 13px",
        borderLeft: `3px solid ${accent}`,
        borderRadius: 4,
      }}
    >
      <span
        style={{
          fontSize: compact ? 15 : 18,
          color: accent,
          lineHeight: 1,
          paddingTop: 1,
        }}
        aria-hidden
      >
        ✦
      </span>
      <div className="flex flex-col gap-1 min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span
            className="text-[13px] font-semibold truncate"
            style={{ color: "var(--text)" }}
          >
            {c.title}
          </span>
          <span
            className="text-[10px] font-medium uppercase tabular-nums"
            style={{
              background: "var(--panel-2)",
              color: "var(--mute)",
              borderRadius: 4,
              padding: "1px 6px",
              letterSpacing: "0.04em",
            }}
          >
            off
          </span>
        </div>
        <div
          className="text-[12px] leading-snug"
          style={{ color: "var(--text-2)" }}
        >
          {c.body}
        </div>
        <div
          className="text-[11px] tabular-nums"
          style={{ color: "var(--mute)" }}
        >
          {c.cost}
        </div>
        {/* Opens the Settings menu rather than flipping the toggle directly —
           we want the user's explicit consent before spending API credits,
           even when they tap a notice that already explains the cost. */}
        <button
          type="button"
          onClick={() =>
            window.dispatchEvent(new CustomEvent("trading-platform:open-settings"))
          }
          className="mt-1.5 self-start cursor-pointer text-[12px] font-semibold"
          style={{
            background: "transparent",
            color: accent,
            border: `1px solid ${accent}`,
            borderRadius: 6,
            padding: "4px 10px",
          }}
        >
          Turn on in Settings
        </button>
      </div>
    </div>
  );
}
