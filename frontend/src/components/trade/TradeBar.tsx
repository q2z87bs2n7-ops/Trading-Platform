import { useState } from "react";

import { useLiveQuotes } from "../../data/useLiveQuotes";
import OrderSheet from "./OrderSheet";

const money = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD" });

interface Props {
  symbol: string;
}

export default function TradeBar({ symbol }: Props) {
  const [open, setOpen] = useState(false);
  const [side, setSide] = useState<"buy" | "sell">("buy");
  const symUpper = symbol.trim().toUpperCase();
  const { quotes } = useLiveQuotes(symUpper ? [symUpper] : []);
  const quote = quotes[symUpper];

  function openSheet(s: "buy" | "sell") {
    setSide(s);
    setOpen(true);
  }

  return (
    <>
      <div
        className="fixed z-30 flex items-center gap-3 text-[13.5px] font-medium left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 justify-between sm:justify-start"
        style={{
          bottom: 20,
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
            height: 32,
            padding: "0 16px",
            borderRadius: 7,
            fontSize: 13,
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
            height: 32,
            padding: "0 16px",
            borderRadius: 7,
            fontSize: 13,
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
