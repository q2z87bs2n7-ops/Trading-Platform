import { useState } from "react";

import { useLiveQuotes } from "../../data/useLiveQuotes";
import { useMobile } from "../../hooks/useMobile";
import OrderSheet from "./OrderSheet";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface Props {
  symbol: string;
}

export default function TradeBar({ symbol }: Props) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  // Mobile: the bar collapses to a floating FAB that expands to Buy/Sell,
  // so it doesn't eat a full-width strip or clash with the ChartBot launcher.
  const [expanded, setExpanded] = useState(false);
  const isMobile = useMobile();
  const symUpper = symbol.trim().toUpperCase();
  const { quotes } = useLiveQuotes(symUpper ? [symUpper] : []);
  const quote = quotes[symUpper];

  function openSheet(s: "buy" | "sell") {
    setSide(s);
    setExpanded(false);
    setOpen(true);
  }

  if (isMobile) {
    const pill = (s: "buy" | "sell") => (
      <button
        type="button"
        onClick={() => openSheet(s)}
        disabled={!symUpper}
        className="cursor-pointer border-0 font-semibold"
        style={{
          background: s === "buy" ? "var(--pos)" : "var(--neg)",
          color: "white",
          minHeight: "var(--mob-tap)",
          width: 132,
          borderRadius: 999,
          fontSize: 15,
          boxShadow: "var(--shadow-lg)",
          opacity: symUpper ? 1 : 0.5,
        }}
      >
        {s === "buy" ? "Buy" : "Sell"}
      </button>
    );
    return (
      <>
        {!open &&
          (expanded ? (
            <>
              <div
                onClick={() => setExpanded(false)}
                style={{ position: "fixed", inset: 0, zIndex: 34 }}
              />
              <div
                style={{
                  position: "fixed",
                  right: 16,
                  bottom: "calc(var(--safe-bottom) + 16px)",
                  zIndex: 35,
                  display: "flex",
                  flexDirection: "column",
                  gap: 10,
                  alignItems: "flex-end",
                }}
              >
                {symUpper && (
                  <span
                    className="font-mono tabular-nums"
                    style={{
                      background: "var(--text)",
                      color: "var(--bg)",
                      borderRadius: 999,
                      padding: "6px 14px",
                      fontSize: 13,
                      fontWeight: 600,
                      boxShadow: "var(--shadow-lg)",
                    }}
                  >
                    {symUpper}
                    {quote ? ` · ${money(quote.mid)}` : ""}
                  </span>
                )}
                {pill("buy")}
                {pill("sell")}
                <button
                  type="button"
                  aria-label="Close trade bar"
                  onClick={() => setExpanded(false)}
                  className="cursor-pointer border-0"
                  style={{
                    width: 52,
                    height: 52,
                    borderRadius: 999,
                    background: "var(--text)",
                    color: "var(--bg)",
                    fontSize: 20,
                    boxShadow: "var(--shadow-lg)",
                  }}
                >
                  ✕
                </button>
              </div>
            </>
          ) : (
            <button
              type="button"
              aria-label="Trade"
              onClick={() => setExpanded(true)}
              disabled={!symUpper}
              className="cursor-pointer border-0"
              style={{
                position: "fixed",
                right: 16,
                bottom: "calc(var(--safe-bottom) + 16px)",
                zIndex: 35,
                width: 52,
                height: 52,
                borderRadius: 999,
                background: "var(--text)",
                color: "var(--bg)",
                fontSize: 22,
                boxShadow: "var(--shadow-lg)",
                opacity: symUpper ? 1 : 0.5,
              }}
            >
              ⇅
            </button>
          ))}
        <OrderSheet
          open={open}
          symbol={symUpper}
          defaultSide={side}
          onClose={() => setOpen(false)}
        />
      </>
    );
  }

  return (
    <>
      <div
        className="fixed z-30 flex items-center gap-3 text-[13.5px] font-medium left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 justify-between sm:justify-start"
        style={{
          bottom: isMobile ? "calc(var(--safe-bottom) + 16px)" : 20,
          background: "var(--text)",
          color: "var(--bg)",
          padding: "6px 6px 6px 16px",
          borderRadius: "var(--r)",
          boxShadow: "var(--shadow-lg)",
          transition: "opacity 0.2s ease",
          opacity: open ? 0 : 1,
          pointerEvents: open ? "none" : "auto",
        }}
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold" style={{ letterSpacing: "-0.005em" }}>
            {symUpper || "—"}
          </span>
          {quote && (
            <span
              className="font-mono text-[13px] tabular-nums"
              style={{ opacity: 0.85 }}
            >
              {money(quote.mid)}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => openSheet("buy")}
          disabled={!symUpper}
          className="cursor-pointer border-0 font-semibold"
          style={{
            background: "var(--pos)",
            color: "white",
            height: isMobile ? 44 : 32,
            padding: isMobile ? "0 22px" : "0 16px",
            borderRadius: 7,
            fontSize: isMobile ? 14 : 13,
            letterSpacing: "-0.005em",
            opacity: symUpper ? 1 : 0.5,
          }}
        >
          Buy
        </button>
        <button
          type="button"
          onClick={() => openSheet("sell")}
          disabled={!symUpper}
          className="cursor-pointer border-0 font-semibold"
          style={{
            background: "var(--neg)",
            color: "white",
            height: isMobile ? 44 : 32,
            padding: isMobile ? "0 22px" : "0 16px",
            borderRadius: 7,
            fontSize: isMobile ? 14 : 13,
            letterSpacing: "-0.005em",
            opacity: symUpper ? 1 : 0.5,
          }}
        >
          Sell
        </button>
      </div>
      <OrderSheet
        open={open}
        symbol={symUpper}
        defaultSide={side}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
