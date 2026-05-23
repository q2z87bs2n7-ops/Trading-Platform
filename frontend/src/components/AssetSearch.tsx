import { type KeyboardEvent, useEffect, useRef, useState } from "react";

import * as api from "../api";
import type { Asset } from "../types";

interface Props {
  // API param value: "us_equity" | "crypto" (drives the search silo).
  assetClass: string;
  onChoose: (symbol: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  variant?: "inline" | "sheet";
}

// Debounced symbol/name autocomplete over the catalogue. Picking a result (or
// pressing Enter) calls onChoose with the symbol; the parent owns the add.
export function AssetSearch({
  assetClass,
  onChoose,
  disabled = false,
  autoFocus = false,
  variant = "inline",
}: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const isCrypto = assetClass === "crypto";
  const sheet = variant === "sheet";

  useEffect(() => {
    const term = q.trim();
    if (!term) {
      setResults([]);
      setOpen(false);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = window.setTimeout(() => {
      api
        .searchAssets(term, assetClass)
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, assetClass]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  function choose(symbol: string) {
    const v = symbol.trim().toUpperCase();
    if (!v) return;
    onChoose(v);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      choose(results[0]?.symbol ?? q);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", width: sheet ? "100%" : 150 }}>
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value.toUpperCase())}
        onKeyDown={onKeyDown}
        onFocus={() => results.length > 0 && setOpen(true)}
        disabled={disabled}
        placeholder={
          isCrypto
            ? sheet
              ? "Search e.g. BTC/USD"
              : "+ pair"
            : sheet
              ? "Search e.g. Apple or AAPL"
              : "+ search"
        }
        aria-label={isCrypto ? "Search crypto pairs" : "Search symbols"}
        className="font-mono tabular-nums"
        style={{
          background: "var(--panel-2)",
          border: "1px solid var(--border)",
          borderRadius: sheet ? 8 : 6,
          color: "var(--text)",
          padding: sheet ? "12px 14px" : "3px 8px",
          fontSize: sheet ? 16 : 11.5,
          width: "100%",
          minHeight: sheet ? "var(--mob-tap)" : undefined,
        }}
      />
      {open && (results.length > 0 || loading) && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            zIndex: 60,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-lg)",
            maxHeight: 280,
            overflowY: "auto",
            // Sheet spans the wrapper; inline anchors to the input's right edge
            // and grows left so it never runs off the right of the screen.
            ...(sheet
              ? { left: 0, right: 0 }
              : { right: 0, width: 300, maxWidth: "90vw" }),
          }}
        >
          {loading && results.length === 0 ? (
            <div style={{ padding: "8px 10px", color: "var(--text-2)", fontSize: 12 }}>
              Searching…
            </div>
          ) : (
            results.map((a) => (
              <button
                key={a.symbol}
                type="button"
                onClick={() => choose(a.symbol)}
                className="cursor-pointer"
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  width: "100%",
                  textAlign: "left",
                  background: "transparent",
                  border: "none",
                  borderBottom: "1px solid var(--border)",
                  padding: "8px 10px",
                  color: "var(--text)",
                }}
              >
                <span
                  className="font-mono"
                  style={{ fontSize: 12.5, fontWeight: 600, minWidth: 70 }}
                >
                  {a.symbol}
                </span>
                <span
                  style={{
                    fontSize: 12,
                    color: "var(--text-2)",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    flex: 1,
                  }}
                >
                  {a.name}
                </span>
                {a.sector && (
                  <span
                    style={{
                      fontSize: 10.5,
                      color: "var(--text-2)",
                      whiteSpace: "nowrap",
                    }}
                  >
                    {a.sector}
                  </span>
                )}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
