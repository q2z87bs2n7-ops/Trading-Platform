import type React from "react";

export function CardsRow({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="grid gap-3 pb-3 overflow-x-auto"
      style={{
        gridAutoFlow: "column",
        gridAutoColumns: "minmax(180px, 1fr)",
        scrollSnapType: "x mandatory",
      }}
    >
      {children}
    </div>
  );
}
