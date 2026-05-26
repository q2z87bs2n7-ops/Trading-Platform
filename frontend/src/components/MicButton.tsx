interface Props {
  listening: boolean;
  onClick: () => void;
  size?: number;
  // Visual variant — "accent" picks up the parent's accent (teal Ask),
  // "subtle" stays panel-toned (violet ChartBot pill).
  variant?: "accent" | "subtle";
  title?: string;
}

// Compact mic toggle used by both the Ask anything composer and the ChartBot
// pill. Pulses red while listening; otherwise picks up the requested variant.
export default function MicButton({
  listening,
  onClick,
  size = 32,
  variant = "subtle",
  title,
}: Props) {
  const bg = listening
    ? "var(--neg)"
    : variant === "accent"
      ? "var(--accent-bg)"
      : "var(--panel)";
  const fg = listening
    ? "white"
    : variant === "accent"
      ? "var(--accent-2)"
      : "var(--text-2)";
  const border = listening
    ? "var(--neg)"
    : variant === "accent"
      ? "var(--accent)"
      : "var(--border)";

  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={listening ? "Stop dictation" : "Start dictation"}
      aria-pressed={listening}
      title={title ?? (listening ? "Stop dictation" : "Dictate")}
      className="cursor-pointer grid place-items-center shrink-0"
      style={{
        background: bg,
        color: fg,
        border: `1px solid ${border}`,
        width: size,
        height: size,
        borderRadius: 999,
        animation: listening ? "mic-pulse 1.2s ease-in-out infinite" : undefined,
      }}
    >
      <style>{`@keyframes mic-pulse{0%,100%{box-shadow:0 0 0 0 rgba(220,38,38,0.55)}50%{box-shadow:0 0 0 6px rgba(220,38,38,0)}}`}</style>
      <svg
        width={size * 0.5}
        height={size * 0.5}
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden
      >
        <rect x="9" y="3" width="6" height="12" rx="3" />
        <path d="M5 11a7 7 0 0 0 14 0" />
        <line x1="12" y1="18" x2="12" y2="22" />
      </svg>
    </button>
  );
}
