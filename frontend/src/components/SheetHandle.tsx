import { useRef, type RefObject } from "react";

// 36×4 pill grabber for mobile bottom-sheets. Three ways to dismiss the
// parent sheet:
// - tap the pill (calls `onClick`).
// - drag the pill down past ~30% of the sheet's height, or flick down with
//   reasonable velocity (calls `onClick` once snapped off-screen).
// - drag a small amount and release: snaps back to rest.
//
// Pass `sheetRef` pointing at the sheet's outermost element to enable the
// drag path; without it the handle is tap-only (used by surfaces that
// already animate via their own logic).
export default function SheetHandle({
  ariaLabel,
  onClick,
  sheetRef,
}: {
  ariaLabel?: string;
  onClick?: () => void;
  sheetRef?: RefObject<HTMLElement | null>;
}) {
  // Track the in-progress drag (refs, not state — we don't want a re-render
  // every frame; the visual update is a direct transform write).
  const drag = useRef<{
    startY: number;
    startT: number;
    lastY: number;
    lastT: number;
    height: number;
    prevTransition: string;
  } | null>(null);

  function setTransform(y: number) {
    const el = sheetRef?.current;
    if (!el) return;
    el.style.transform = y > 0 ? `translateY(${y}px)` : "";
  }

  function onTouchStart(e: React.TouchEvent) {
    if (!sheetRef?.current || !onClick) return;
    const t = e.touches[0];
    const el = sheetRef.current;
    drag.current = {
      startY: t.clientY,
      startT: performance.now(),
      lastY: t.clientY,
      lastT: performance.now(),
      height: el.getBoundingClientRect().height,
      prevTransition: el.style.transition,
    };
    // No animation while the finger drives the position.
    el.style.transition = "none";
  }

  function onTouchMove(e: React.TouchEvent) {
    if (!drag.current) return;
    const t = e.touches[0];
    const dy = t.clientY - drag.current.startY;
    drag.current.lastY = t.clientY;
    drag.current.lastT = performance.now();
    // Clamp upward drag (rubber-band would feel nicer but is overkill here).
    setTransform(Math.max(0, dy));
  }

  function onTouchEnd() {
    const d = drag.current;
    const el = sheetRef?.current;
    if (!d || !el) {
      drag.current = null;
      return;
    }
    const dy = Math.max(0, d.lastY - d.startY);
    const dt = Math.max(1, d.lastT - d.startT);
    const velocity = dy / dt; // px / ms
    const farEnough = dy > d.height * 0.3;
    const fastFlick = dy > 60 && velocity > 0.4;

    // Snap path — short transition, either dismiss off-screen or rest.
    el.style.transition = "transform 180ms ease-out";
    if (farEnough || fastFlick) {
      // Translate fully off the bottom before calling onClick so the unmount
      // doesn't pop visually. Most sheets are positioned at the viewport
      // bottom, so translating by their own height + a small margin clears.
      el.style.transform = `translateY(${d.height + 24}px)`;
      window.setTimeout(() => {
        // Restore inline styles before unmounting in case the host re-uses
        // the same node on the next open.
        el.style.transition = d.prevTransition;
        el.style.transform = "";
        onClick?.();
      }, 170);
    } else {
      el.style.transform = "";
      // Restore the host's transition (often "" or a CSS class transition)
      // after the snap-back finishes.
      window.setTimeout(() => {
        if (el) el.style.transition = d.prevTransition;
      }, 200);
    }
    drag.current = null;
  }

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

  // If neither onClick nor sheetRef is provided, the handle is a visual
  // ornament — render a plain div, no interactivity.
  if (!onClick) {
    return (
      <div
        style={{ display: "flex", justifyContent: "center", paddingBottom: 10 }}
      >
        {pill}
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={onClick}
      onTouchStart={onTouchStart}
      onTouchMove={onTouchMove}
      onTouchEnd={onTouchEnd}
      onTouchCancel={onTouchEnd}
      aria-label={ariaLabel ?? "Dismiss sheet"}
      className="border-0 bg-transparent cursor-pointer"
      style={{
        display: "flex",
        justifyContent: "center",
        padding: "8px 0 4px",
        width: "100%",
        // Disable browser-default touch gestures (pull-to-refresh, scroll)
        // so the drag belongs to us.
        touchAction: "none",
      }}
    >
      {pill}
    </button>
  );
}
