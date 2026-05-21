// Shared card shell for every ⌘K result. Keeps the teal border-left rail
// and consistent padding/radius so every card reads as "an AI answer"
// regardless of which intent produced it.

export default function CmdResultCard({
  title,
  meta,
  children,
}: {
  title?: string;
  meta?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className="p-4"
      style={{
        background: "var(--panel)",
        border: "1px solid var(--border)",
        borderLeft: "2px solid var(--accent)",
        borderRadius: "var(--r)",
        boxShadow: "var(--shadow-sm)",
      }}
    >
      {(title || meta) && (
        <div className="flex items-baseline justify-between mb-3">
          {title && (
            <div className="text-[13px] font-semibold">{title}</div>
          )}
          {meta && (
            <div
              className="font-mono text-[11px] tabular-nums"
              style={{ color: "var(--mute)" }}
            >
              {meta}
            </div>
          )}
        </div>
      )}
      {children}
    </div>
  );
}
