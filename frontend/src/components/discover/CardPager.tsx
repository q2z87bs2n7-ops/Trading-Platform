// Tiny shared pager for Discover cards (earnings count-pages, economic
// day-pages). Presentational: label in the middle, prev/next on the ends.
export function CardPager({
  label,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  label: React.ReactNode;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  const btn =
    "px-2 py-0.5 rounded border-0 bg-transparent text-[13px] font-mono cursor-pointer disabled:opacity-30 disabled:cursor-default";
  return (
    <div
      className="flex items-center justify-between mt-2 pt-2"
      style={{ borderTop: "1px solid var(--border)" }}
    >
      <button
        type="button"
        className={btn}
        style={{ color: "var(--mute)" }}
        disabled={!canPrev}
        onClick={onPrev}
        aria-label="Previous"
      >
        ‹ Prev
      </button>
      <span className="text-[12px] tabular-nums" style={{ color: "var(--mute)" }}>
        {label}
      </span>
      <button
        type="button"
        className={btn}
        style={{ color: "var(--mute)" }}
        disabled={!canNext}
        onClick={onNext}
        aria-label="Next"
      >
        Next ›
      </button>
    </div>
  );
}
