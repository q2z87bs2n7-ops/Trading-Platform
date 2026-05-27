import type React from "react";

import { useMobile } from "../../hooks/useMobile";

// Watchlist card layout. Mobile keeps the horizontal touch-scroll strip; iPad
// goes 2-col grid, desktop goes 3-col. Children scroll-snap on the mobile
// branch (existing behaviour); on grids snap-align is harmless.
export function CardsRow({ children }: { children: React.ReactNode }) {
  const isMobile = useMobile();
  if (isMobile)
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
  return (
    <div className="grid gap-3 pb-3 grid-cols-2 lg:grid-cols-3">{children}</div>
  );
}
