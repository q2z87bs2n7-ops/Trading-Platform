interface Props {
  onPick: (text: string) => void;
}

const SUGGESTIONS = [
  "Draw a horizontal line at the current price",
  "Mark the last swing high on the 1H",
  "Add the 50 and 200 SMA",
  "What's my AAPL position size?",
];

export default function ChatEmptyState({ onPick }: Props) {
  return (
    <div className="mt-2 text-muted">
      <p className="mb-2 text-[13px]">Ask me to annotate the chart:</p>
      <div className="flex flex-col gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="cursor-pointer rounded border border-border bg-panel px-2 py-1.5 text-left text-[12px] text-text-2 hover:border-border-strong hover:text-text"
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
