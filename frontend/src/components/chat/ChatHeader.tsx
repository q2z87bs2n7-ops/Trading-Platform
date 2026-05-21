interface Props {
  canClear: boolean;
  onCollapse: () => void;
  onClear: () => void;
}

export default function ChatHeader({ canClear, onCollapse, onClear }: Props) {
  return (
    <div
      className="flex items-center justify-between px-3 py-2.5"
      style={{
        background:
          "linear-gradient(180deg, var(--cb-accent-soft) 0%, var(--panel) 100%)",
        borderBottom: "1px solid var(--hairline)",
      }}
    >
      <div className="flex items-center gap-2.5 min-w-0">
        <div
          className="grid place-items-center text-white font-semibold text-[13px] shrink-0"
          style={{
            width: 28,
            height: 28,
            borderRadius: 6,
            background:
              "linear-gradient(135deg, var(--cb-accent) 0%, var(--cb-accent-2) 100%)",
          }}
          aria-hidden
        >
          ✦
        </div>
        <div className="flex flex-col leading-tight min-w-0">
          <span className="text-[13.5px] font-semibold truncate">ChartBot</span>
          <span
            className="text-[11px] truncate"
            style={{ color: "var(--mute)" }}
          >
            Specialized chart assistant
          </span>
        </div>
      </div>
      <div className="flex items-center gap-1 shrink-0">
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          title="Clear conversation"
          aria-label="Clear conversation"
          className="cursor-pointer border-0 bg-transparent px-2 text-[11px] disabled:cursor-not-allowed disabled:opacity-40"
          style={{ color: "var(--text-2)" }}
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse"
          aria-label="Collapse ChartBot"
          className="cursor-pointer border-0 bg-transparent text-[16px]"
          style={{ color: "var(--text-2)" }}
        >
          ›
        </button>
      </div>
    </div>
  );
}
