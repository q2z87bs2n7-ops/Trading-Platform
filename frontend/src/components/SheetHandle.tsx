// 36×4 pill grabber that sits at the top of every mobile bottom-sheet so the
// affordance feels native. Extracted so the EquitySheet, ChatPanel mobile
// sheet, and any future mobile sheets share one shape; swipe-to-dismiss can
// be added here once we wire a gesture.
export default function SheetHandle({
  ariaLabel,
  onClick,
}: {
  ariaLabel?: string;
  onClick?: () => void;
}) {
  const pill = (
    <span
      aria-hidden
      style={{
        width: 36,
        height: 4,
        borderRadius: 99,
        background: "var(--border-2)",
        display: "block",
      }}
    />
  );
  // If a callback is provided (e.g. "tap to dismiss"), render as a button so
  // it's keyboard-reachable. Otherwise it's a visual-only ornament.
  if (onClick) {
    return (
      <button
        type="button"
        onClick={onClick}
        aria-label={ariaLabel ?? "Dismiss sheet"}
        className="border-0 bg-transparent cursor-pointer"
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "8px 0 4px",
          width: "100%",
        }}
      >
        {pill}
      </button>
    );
  }
  return (
    <div style={{ display: "flex", justifyContent: "center", paddingBottom: 10 }}>
      {pill}
    </div>
  );
}
