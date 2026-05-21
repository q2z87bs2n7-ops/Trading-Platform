import { useEffect } from "react";

interface Props {
  title: string;
  body?: string;
  confirmLabel: string;
  cancelLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/**
 * Inline replacement for window.confirm. Bottom-sheet card matching
 * OrderSheet / ClosePositionCard / ModifyOrderCard so destructive
 * actions read as the same shape across the app.
 */
export default function ConfirmCard({
  title,
  body,
  confirmLabel,
  cancelLabel = "Cancel",
  destructive,
  pending,
  onConfirm,
  onCancel,
}: Props) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onCancel();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [pending, onCancel]);

  return (
    <div
      role="dialog"
      aria-modal
      className="fixed inset-0 z-50 flex items-end justify-center"
      style={{
        background: "rgba(20, 22, 28, 0.45)",
        backdropFilter: "blur(4px)",
      }}
      onClick={pending ? undefined : onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-[440px]"
        style={{
          background: "var(--panel)",
          borderTopLeftRadius: "var(--r-xl)",
          borderTopRightRadius: "var(--r-xl)",
          boxShadow: "var(--shadow-lg)",
          padding: "20px 24px 24px",
          animation: "confirm-up 200ms ease",
        }}
      >
        <style>{`@keyframes confirm-up{from{transform:translateY(40px);opacity:0}to{transform:translateY(0);opacity:1}}`}</style>

        <div className="text-[16px] font-semibold mb-1.5">{title}</div>
        {body && (
          <div
            className="text-[13.5px] leading-snug mb-5"
            style={{ color: "var(--text-2)" }}
          >
            {body}
          </div>
        )}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={pending}
            className="flex-1 text-[13.5px] font-medium cursor-pointer"
            style={{
              padding: "11px",
              borderRadius: "var(--r)",
              background: "transparent",
              border: "1px solid var(--border)",
              color: "var(--text-2)",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={pending}
            className="flex-1 text-[13.5px] font-semibold cursor-pointer border-0"
            style={{
              padding: "11px",
              borderRadius: "var(--r)",
              background: destructive ? "var(--neg)" : "var(--accent)",
              color: "white",
              opacity: pending ? 0.6 : 1,
            }}
          >
            {pending ? "Working…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
