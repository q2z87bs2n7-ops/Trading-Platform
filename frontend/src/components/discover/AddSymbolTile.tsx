import { useEffect, useRef, useState } from "react";

import { AssetSearch } from "../AssetSearch";

// "+ Add a symbol" tile — the persistent affordance the spec calls for as the
// last grid cell on every viewport. Desktop click swaps the tile into an
// inline AssetSearch (same grid cell, autoFocus, dropdown portals from the
// component). Mobile calls onMobileTap to open the existing add-sheet.
//
// Stays a single grid item so the parent's grid math (3-col desktop / 2-col
// iPad / horizontal touch-scroll on mobile) is unchanged.
export function AddSymbolTile({
  assetClass,
  isCrypto,
  isMobile,
  disabled,
  onChoose,
  onMobileTap,
}: {
  assetClass: "us_equity" | "crypto";
  isCrypto: boolean;
  isMobile: boolean;
  disabled: boolean;
  onChoose: (symbol: string) => void;
  onMobileTap: () => void;
}) {
  const [searching, setSearching] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Collapse the search-mode tile when the user clicks outside it. Click-on-a-
  // result lands inside the portaled dropdown, which is outside this DOM
  // subtree — so we close on next mousedown OR onChoose, whichever fires first.
  useEffect(() => {
    if (!searching) return;
    function onDown(e: MouseEvent) {
      const t = e.target as Node;
      if (ref.current?.contains(t)) return;
      // The AssetSearch result list is portaled to <body>; clicks in it
      // mean the user picked a symbol (onChoose will fire and close us).
      const portal = (t as HTMLElement | null)?.closest?.(
        "[data-asset-search-dropdown]",
      );
      if (portal) return;
      setSearching(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setSearching(false);
    }
    document.addEventListener("mousedown", onDown);
    window.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      window.removeEventListener("keydown", onKey);
    };
  }, [searching]);

  function handleChoose(sym: string) {
    onChoose(sym);
    setSearching(false);
  }

  // Mobile path is unchanged — just a tap target that opens the sheet.
  if (isMobile) {
    return (
      <button
        type="button"
        onClick={onMobileTap}
        aria-label="Add to watchlist"
        style={{
          scrollSnapAlign: "start",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          minWidth: 90,
          border: "1.5px dashed var(--border-2)",
          borderRadius: "var(--r)",
          background: "transparent",
          color: "var(--accent)",
          fontSize: 13,
          fontWeight: 600,
          cursor: "pointer",
        }}
      >
        + Add
      </button>
    );
  }

  // Desktop: clicking the tile swaps it in-place for an AssetSearch input.
  // The shape mirrors a SparkCard so the grid rhythm doesn't break.
  return (
    <div
      ref={ref}
      style={{
        border: `1.5px dashed ${
          searching ? "var(--accent)" : "var(--border-2)"
        }`,
        borderRadius: "var(--r)",
        background: searching ? "var(--panel)" : "transparent",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: searching ? "10px 12px" : "8px",
        minHeight: 130,
        transition: "background 0.12s, border-color 0.12s",
      }}
    >
      {searching ? (
        <AssetSearch
          variant="inline"
          align="left"
          fluid
          autoFocus
          assetClass={assetClass}
          onChoose={handleChoose}
          disabled={disabled}
        />
      ) : (
        <button
          type="button"
          onClick={() => setSearching(true)}
          aria-label={`Add ${isCrypto ? "pair" : "symbol"} to watchlist`}
          className="flex flex-col items-center justify-center gap-1 cursor-pointer w-full h-full"
          style={{
            background: "transparent",
            border: 0,
            color: "var(--accent)",
            fontSize: 13,
            fontWeight: 600,
          }}
        >
          <span style={{ fontSize: 22, lineHeight: 1, fontWeight: 400 }}>
            +
          </span>
          <span>Add {isCrypto ? "pair" : "symbol"}</span>
        </button>
      )}
    </div>
  );
}
