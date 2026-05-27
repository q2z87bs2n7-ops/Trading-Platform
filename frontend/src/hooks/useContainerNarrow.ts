import { useEffect, useState, type RefObject } from "react";

/**
 * True when the observed element's width is below `threshold`. Drives
 * panel-size-aware layout switches inside the Workspace (e.g. tables → stacked
 * cards) where `useMobile()` can't help — that's viewport-based and the
 * Workspace is desktop-only, so a narrow dock panel never trips it.
 */
export function useContainerNarrow(
  ref: RefObject<HTMLElement>,
  threshold: number,
): boolean {
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const w = el.clientWidth;
      if (w === 0) return;
      const next = w < threshold;
      setNarrow((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, threshold]);

  return narrow;
}

/**
 * True when the observed element's height is at or above `threshold`. Sibling
 * to `useContainerNarrow` for height-axis adaptations (e.g. tall+narrow
 * Positions docks getting a tighter row to show more rows at once).
 */
export function useContainerTall(
  ref: RefObject<HTMLElement>,
  threshold: number,
): boolean {
  const [tall, setTall] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const measure = () => {
      const h = el.clientHeight;
      if (h === 0) return;
      const next = h >= threshold;
      setTall((prev) => (prev === next ? prev : next));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [ref, threshold]);

  return tall;
}
