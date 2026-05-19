// Single status-pill primitive. Used wherever the API would otherwise
// dump a raw enum string ("filled", "us_equity", "AssetClass.X") into
// the UI. The tone is derived from the status key by default; pass
// `tone="neutral"` to opt out (e.g. for activity-type categories that
// aren't really statuses).

type Tone = "pos" | "warn" | "neg" | "neutral";

interface Props {
  status: string | null | undefined;
  tone?: Tone;
}

// Status -> tone mapping. Keys are lower-snake-case after enumTail clean.
const TONE_MAP: Record<string, Tone> = {
  // pos
  filled: "pos",
  open: "pos",
  active: "pos",
  // warn
  new: "warn",
  pending: "warn",
  pending_new: "warn",
  pending_replace: "warn",
  pending_cancel: "warn",
  accepted: "warn",
  partially_filled: "warn",
  // neg
  rejected: "neg",
  canceled: "neg",
  cancelled: "neg",
  expired: "neg",
  done_for_day: "neg",
  replaced: "neg",
};

const TONE_STYLE: Record<Tone, { bg: string; color: string }> = {
  pos: { bg: "var(--pos-bg)", color: "var(--pos)" },
  warn: { bg: "var(--warn-bg)", color: "var(--warn)" },
  neg: { bg: "var(--neg-bg)", color: "var(--neg)" },
  neutral: { bg: "rgba(255, 255, 255, 0.04)", color: "var(--muted)" },
};

// Alpaca passes enums as either "filled" or "OrderStatus.FILLED" — strip
// the prefix and normalise.
function clean(raw: string): string {
  return raw.split(".").pop()!.trim().toLowerCase();
}

export default function Pill({ status, tone }: Props) {
  if (status == null || status === "") return <span className="text-muted">—</span>;
  const key = clean(String(status));
  const resolvedTone = tone ?? TONE_MAP[key] ?? "neutral";
  const style = TONE_STYLE[resolvedTone];
  const label = key.replace(/_/g, " ");

  return (
    <span
      className="inline-block px-1.5 py-0.5 text-[10px] rounded uppercase tracking-wide font-medium whitespace-nowrap"
      style={{
        backgroundColor: style.bg,
        color: style.color,
      }}
    >
      {label}
    </span>
  );
}
