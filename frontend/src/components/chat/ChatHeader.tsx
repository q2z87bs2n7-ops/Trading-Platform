interface Props {
  symbol: string;
  canClear: boolean;
  onCollapse: () => void;
  onClear: () => void;
}

export default function ChatHeader({ symbol, canClear, onCollapse, onClear }: Props) {
  return (
    <div className="flex items-center justify-between border-b border-border px-3 py-2">
      <div className="text-[13px] font-semibold">
        ChartBot
        <span className="ml-1.5 font-normal text-muted">· {symbol}</span>
      </div>
      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onClear}
          disabled={!canClear}
          title="Clear conversation"
          aria-label="Clear conversation"
          className="cursor-pointer border-none bg-transparent px-1 text-[11px] text-text-3 hover:text-text disabled:cursor-not-allowed disabled:opacity-40"
        >
          Clear
        </button>
        <button
          type="button"
          onClick={onCollapse}
          title="Collapse"
          aria-label="Collapse ChartBot"
          className="cursor-pointer border-none bg-transparent text-base text-text-3 hover:text-text"
        >
          ›
        </button>
      </div>
    </div>
  );
}
