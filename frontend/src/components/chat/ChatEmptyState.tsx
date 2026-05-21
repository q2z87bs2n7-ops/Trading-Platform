interface Props {
  onPick: (text: string) => void;
}

// Chart-specialized prompts. Mirrors intents.md §"Empty-state suggestions".
const SUGGESTIONS = [
  "Trendline from 30-day low to high",
  "Add 50 + 200 SMA",
  "Mark entry at $482",
  "What's the trend?",
  "Where to place stops",
  "Compare with QQQ",
  "Switch to 4h",
  "Clear all drawings",
];

export default function ChatEmptyState({ onPick }: Props) {
  return (
    <div className="mt-1">
      <p className="mb-3 text-[12.5px]" style={{ color: "var(--mute)" }}>
        Try one of these:
      </p>
      <div className="flex flex-col gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onPick(s)}
            className="cursor-pointer text-left text-[12.5px] transition-colors"
            style={{
              padding: "8px 10px",
              background: "var(--panel)",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              borderRadius: "var(--r)",
            }}
          >
            {s}
          </button>
        ))}
      </div>
    </div>
  );
}
