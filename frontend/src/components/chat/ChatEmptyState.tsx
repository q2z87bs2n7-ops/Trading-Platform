interface Props {
  onPick: (text: string) => void;
}

// Chart-specialized prompts. Bold leading verb + body — verb tells the user
// what category of move the bot is going to make (Draw, Add, Mark, Summarise,
// etc.), body is the specific request that gets sent. Background tinted with
// --cb-accent-soft so the strip reads as a ChartBot affordance.
const SUGGESTIONS: { verb: string; body: string }[] = [
  { verb: "Draw", body: "support at yesterday's low" },
  { verb: "Add", body: "50-MA + RSI" },
  { verb: "Mark", body: "entry at $482" },
  { verb: "Summarise", body: "this chart" },
  { verb: "Compare", body: "with QQQ" },
  { verb: "Suggest", body: "where to place stops" },
];

export default function ChatEmptyState({ onPick }: Props) {
  return (
    <div className="mt-1">
      <p className="mb-3 text-[12.5px]" style={{ color: "var(--mute)" }}>
        Try one of these:
      </p>
      <div className="flex flex-wrap gap-1.5">
        {SUGGESTIONS.map((s) => (
          <button
            key={`${s.verb}-${s.body}`}
            type="button"
            onClick={() => onPick(`${s.verb} ${s.body}`)}
            className="cursor-pointer text-left transition-colors inline-flex items-center gap-1 border-0"
            style={{
              background: "var(--cb-accent-soft)",
              color: "var(--cb-accent)",
              borderRadius: 99,
              padding: "5px 10px",
              fontSize: 11,
            }}
          >
            <b style={{ fontWeight: 700 }}>{s.verb}</b>
            <span>{s.body}</span>
          </button>
        ))}
      </div>
    </div>
  );
}
