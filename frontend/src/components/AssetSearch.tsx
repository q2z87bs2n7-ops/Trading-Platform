import { type KeyboardEvent, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

import * as api from "../api";
import type { Asset } from "../types";

interface Props {
  // API param value: "us_equity" | "crypto", or "" to search all silos.
  // Ignored when source === "fxcm".
  assetClass: string;
  onChoose: (symbol: string) => void;
  disabled?: boolean;
  autoFocus?: boolean;
  variant?: "inline" | "sheet";
  // Which edge the dropdown anchors to (so it never runs off-screen). Use
  // "right" when the input sits at the right of its row, "left" otherwise.
  align?: "left" | "right";
  // Let the input fill its container instead of the default fixed inline width
  // (e.g. inside a narrow Workspace widget header).
  fluid?: boolean;
  // Catalogue to search. Default = Alpaca's /api/assets (us_equity + crypto).
  // "fxcm" routes through getFxcmInstruments() + client-side filter since the
  // FXCM bridge has no server-side search.
  source?: "alpaca" | "fxcm";
}

// Debounced symbol/name autocomplete over the catalogue. Picking a result (or
// pressing Enter) calls onChoose with the symbol; the parent owns the add.
export function AssetSearch({
  assetClass,
  onChoose,
  disabled = false,
  autoFocus = false,
  variant = "inline",
  align = "right",
  fluid = false,
  source = "alpaca",
}: Props) {
  const [q, setQ] = useState("");
  const [results, setResults] = useState<Asset[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const isCrypto = assetClass === "crypto";
  const isFxcm = source === "fxcm";
  const sheet = variant === "sheet";
  // Fixed-position coords for the portaled inline dropdown.
  const [pos, setPos] = useState({ top: 0, left: 0, width: 300 });

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
      const fetcher = isFxcm
        ? api.getFxcmInstruments().then((list) => {
            const Q = term.toUpperCase();
            const filtered = list.filter((i) =>
              i.instrument.toUpperCase().includes(Q),
            );
            // Prefix matches first, same ranking the chart-tab search uses.
            filtered.sort((a, b) => {
              const ap = a.instrument.toUpperCase().startsWith(Q) ? 0 : 1;
              const bp = b.instrument.toUpperCase().startsWith(Q) ? 0 : 1;
              if (ap !== bp) return ap - bp;
              return a.instrument.localeCompare(b.instrument);
            });
            // Map FxcmInstrument → Asset shape so the renderer below stays
            // unchanged. Only `symbol` and `name` are read by the dropdown.
            return filtered.slice(0, 50).map(
              (i): Asset => ({
                symbol: i.instrument,
                name: i.instrument,
                asset_class: "cfd",
                exchange: "FXCM",
              }) as Asset,
            );
          })
        : api.searchAssets(term, assetClass);
      fetcher
        .then((r) => {
          setResults(r);
          setOpen(true);
        })
        .catch(() => setResults([]))
        .finally(() => setLoading(false));
    }, 200);
    return () => window.clearTimeout(t);
  }, [q, assetClass, isFxcm]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      const t = e.target as Node;
      if (wrapRef.current?.contains(t)) return;
      if (dropRef.current?.contains(t)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  // The inline dropdown is portaled to <body> with fixed positioning so it
  // floats above (instead of being clipped by) a dock panel's bounds. Recompute
  // its anchor while open as the page scrolls/resizes. The sheet variant lives
  // in a full-screen sheet and keeps its in-flow absolute dropdown.
  useEffect(() => {
    if (sheet || !open) return;
    const update = () => {
      const el = wrapRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const width = Math.min(300, window.innerWidth - 16);
      let left = align === "left" ? r.left : r.right - width;
      left = Math.max(8, Math.min(left, window.innerWidth - width - 8));
      setPos({ top: r.bottom + 4, left, width });
    };
    update();
    window.addEventListener("scroll", update, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", update, true);
      window.removeEventListener("resize", update);
    };
  }, [open, sheet, align, results.length]);

  function choose(symbol: string) {
    // FXCM symbols are case-sensitive in the bridge ("RBLX.us", not "RBLX.US")
    // — uppercasing breaks them. Alpaca tickers are uppercase already.
    const v = isFxcm ? symbol.trim() : symbol.trim().toUpperCase();
    if (!v) return;
    onChoose(v);
    setQ("");
    setResults([]);
    setOpen(false);
  }

  function onKeyDown(e: KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      e.preventDefault();
      // Only commit when there's a real catalogue match — typing a bogus
      // ticker and hitting Enter used to fire the add and then surface an
      // error toast, which read as "search is broken". Now we just keep the
      // dropdown open showing "No matches".
      if (results[0]) choose(results[0].symbol);
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  const items =
    loading && results.length === 0 ? (
      <div style={{ padding: "8px 10px", color: "var(--text-2)", fontSize: 12 }}>
        Searching…
      </div>
    ) : results.length === 0 ? (
      <div style={{ padding: "8px 10px", color: "var(--text-2)", fontSize: 12 }}>
        No matches
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
    );

  // Open the dropdown whenever the user is searching — even on a no-match —
  // so they get an explicit "No matches" affordance instead of silence.
  const showDropdown = open && q.trim().length > 0;

  return (
    <div
      ref={wrapRef}
      style={{ position: "relative", width: sheet || fluid ? "100%" : 150 }}
    >
      <input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value.toUpperCase())}
        onKeyDown={onKeyDown}
        onFocus={() => q.trim().length > 0 && setOpen(true)}
        disabled={disabled}
        placeholder={
          isFxcm
            ? sheet
              ? "Search e.g. EUR/USD, US30"
              : "+ instrument"
            : isCrypto
              ? sheet
                ? "Search e.g. BTC/USD"
                : "+ pair"
              : sheet
                ? "Search e.g. Apple or AAPL"
                : "+ search"
        }
        aria-label={
          isFxcm
            ? "Search FXCM instruments"
            : isCrypto
              ? "Search crypto pairs"
              : "Search symbols"
        }
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

      {/* Sheet: in-flow dropdown spanning the wrapper. */}
      {sheet && showDropdown && (
        <div
          style={{
            position: "absolute",
            top: "calc(100% + 4px)",
            left: 0,
            right: 0,
            zIndex: 60,
            background: "var(--panel)",
            border: "1px solid var(--border)",
            borderRadius: 8,
            boxShadow: "var(--shadow-lg)",
            maxHeight: 280,
            overflowY: "auto",
          }}
        >
          {items}
        </div>
      )}

      {/* Inline: portaled, fixed-position dropdown that escapes panel clipping. */}
      {!sheet &&
        showDropdown &&
        createPortal(
          <div
            ref={dropRef}
            data-asset-search-dropdown
            style={{
              position: "fixed",
              top: pos.top,
              left: pos.left,
              width: pos.width,
              zIndex: 1000,
              background: "var(--panel)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              boxShadow: "var(--shadow-lg)",
              maxHeight: 280,
              overflowY: "auto",
            }}
          >
            {items}
          </div>,
          document.body,
        )}
    </div>
  );
}
