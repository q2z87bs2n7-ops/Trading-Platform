import { useEffect, useState } from "react";

// Single mobile breakpoint, matched to the CSS @media (max-width: 640px) rule.
// SSR-safe: starts false, updates on mount. matchMedia avoids resize churn.
const QUERY = "(max-width: 640px)";

export function useMobile(): boolean {
  const [m, setM] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(QUERY);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return m;
}
