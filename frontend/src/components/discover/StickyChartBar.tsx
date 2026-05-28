import { useEffect, useState, type RefObject } from "react";

import { useMobile } from "../../hooks/useMobile";
import { pct } from "../../lib/format";

// Slim sticky bar that appears at the top of the Discover main column once
// the inline chart card has scrolled off the top. Click smooth-scrolls back.
// Desktop-only — mobile is short enough that the chart's never far from view.
// Shared by stocks/crypto DiscoverPage and CfdDiscoverPage.
interface Props {
  chartCardRef: RefObject<HTMLDivElement | null>;
  symbol: string;
  price: number;
  dayChangePct: number;
  formatPrice: (n: number) => string;
  // Optional display label (e.g. "Bitcoin (BTC)" on the crypto silo) —
  // falls back to the symbol if absent.
  label?: string;
}

export function StickyChartBar({
  chartCardRef,
  symbol,
  price,
  dayChangePct,
  formatPrice,
  label,
}: Props) {
  const isMobile = useMobile();
  const [offscreen, setOffscreen] = useState(false);

  useEffect(() => {
    if (isMobile) {
      setOffscreen(false);
      return;
    }
    const el = chartCardRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      ([entry]) => {
        // Only show when the chart has scrolled OFF the top — not when it
        // hasn't entered yet from below.
        const passedTop = entry.boundingClientRect.bottom < 0;
        setOffscreen(!entry.isIntersecting && passedTop);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => io.disconnect();
    // `symbol` is in the dep list (not just chartCardRef) because refs don't
    // re-trigger effects on their own. The chart card mounts conditionally
    // (e.g. CfdDiscoverPage gates it on `bridgeOk && selected`), so the ref
    // is null on first render and only attaches once symbol becomes real —
    // we need to re-observe when that happens.
  }, [chartCardRef, isMobile, symbol]);

  if (!offscreen || !symbol) return null;
  const up = dayChangePct >= 0;
  const scrollBack = () =>
    chartCardRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={scrollBack}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          scrollBack();
        }
      }}
      title={`Scroll back to ${symbol} chart`}
      className="cursor-pointer flex items-center gap-3"
      style={{
        position: "sticky",
        top: 8,
        zIndex: 20,
        marginBottom: 12,
        padding: "8px 14px",
        background: "var(--text)",
        color: "var(--bg)",
        border: "none",
        borderRadius: "var(--r)",
        boxShadow: "var(--shadow-lg)",
      }}
    >
      <span className="font-semibold" style={{ fontSize: 13 }}>
        {label || symbol}
      </span>
      <span className="font-mono tabular-nums" style={{ fontSize: 13 }}>
        {formatPrice(price)}
      </span>
      <span
        className="font-mono tabular-nums"
        style={{
          fontSize: 12,
          color: up ? "var(--pos)" : "var(--neg)",
        }}
      >
        {pct(dayChangePct)}
      </span>
      <span className="ml-auto" style={{ opacity: 0.6, fontSize: 11 }}>
        Scroll to chart ↑
      </span>
    </div>
  );
}
