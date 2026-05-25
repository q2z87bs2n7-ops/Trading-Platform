// Friendly inline blocker shown when a given AI surface is switched off in
// Settings. Container-agnostic (renders just the centred content) so each
// surface can wrap it in its own chrome (Discover hero card, Ask result card,
// ChartBot panel body).

export type AiSurface = "market" | "ask" | "chartbot";

const COPY: Record<AiSurface, { title: string; body: string }> = {
  market: {
    title: "Market summaries are off",
    body: "Auto market briefings are disabled. Turn “Market summary AI” back on in Settings to generate them.",
  },
  ask: {
    title: "AI answers are off",
    body: "Orders, charts, portfolio, movers and news still work — but free-form questions need AI. Turn “Ask anything AI” on in Settings.",
  },
  chartbot: {
    title: "ChartBot is off",
    body: "The chart assistant is disabled. Turn “ChartBot” on in Settings to chat about the chart, draw, and place orders from here.",
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
      className="flex flex-col items-center text-center gap-1.5"
      style={{ padding: compact ? "10px 8px" : "24px 16px" }}
    >
      <span style={{ fontSize: compact ? 16 : 20, color: accent }} aria-hidden>
        ✦
      </span>
      <div className="text-[13px] font-semibold" style={{ color: "var(--text)" }}>
        {c.title}
      </div>
      <div
        className="text-[12.5px] leading-snug"
        style={{ color: "var(--mute)", maxWidth: 320 }}
      >
        {c.body}
      </div>
    </div>
  );
}
