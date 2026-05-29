import { useEffect, useMemo, useRef } from "react";

import { useFxcmPrices } from "../data/hooks";
import { useFxcmView } from "../lib/fxcm-view";
import {
  setAlertStatus,
  useAlerts,
  type AlertSource,
  type PriceAlert,
} from "../lib/alerts";
import { cfdDigits, fmtCfdPrice } from "../lib/format";
import { initAlertSound, playAlertChime } from "../lib/sound";
import { showToast } from "../lib/toast";
import type { FxcmPrice } from "../types";

// Headless monitor for client-side price alerts. Mounted once in the app shell;
// only touches the bridge while there are armed alerts. In-browser only — it
// fires while the app is open (no server watcher / push; out of scope).

function sourcePrice(p: FxcmPrice | undefined, src: AlertSource): number | undefined {
  if (!p) return undefined;
  const bid = typeof p.bid === "number" ? p.bid : undefined;
  const ask = typeof p.ask === "number" ? p.ask : undefined;
  if (src === "bid") return bid;
  if (src === "ask") return ask;
  if (bid != null && ask != null) return (bid + ask) / 2;
  return bid ?? ask;
}

function fire(a: PriceAlert, p: FxcmPrice | undefined) {
  const digits = p?.digits ?? cfdDigits(a.instrument);
  const word = a.direction === "above" ? "rose above" : "fell below";
  // Longer-lived toast so a fire isn't missed; sharp chime alongside.
  showToast(`🔔 ${a.instrument} ${word} ${fmtCfdPrice(a.price, digits)} · ${a.source}`, "success", 8000);
  playAlertChime();
}

export default function CfdAlertEngine() {
  const alerts = useAlerts();
  const armed = useMemo(() => alerts.filter((a) => a.status === "armed"), [alerts]);
  const instruments = useMemo(
    () => Array.from(new Set(armed.map((a) => a.instrument))),
    [armed],
  );

  // Keep armed instruments subscribed (status T) so /prices includes them even
  // when they're not otherwise on screen.
  useFxcmView(instruments, instruments.length > 0);
  // Only poll while something is armed.
  const { data: prices } = useFxcmPrices(armed.length > 0);

  // Prime the chime's audio context on the first user gesture.
  useEffect(() => {
    initAlertSound();
  }, []);

  // Last observed source price per alert id. A cross needs a prior sample on
  // the opposite side of the threshold, so an alert created already-past its
  // level won't fire until price genuinely crosses it.
  const prevRef = useRef<Map<string, number>>(new Map());

  useEffect(() => {
    if (!prices) return;
    const byInstrument = new Map(prices.map((p) => [p.instrument, p]));
    for (const a of armed) {
      const p = byInstrument.get(a.instrument);
      const cur = sourcePrice(p, a.source);
      if (cur == null) continue;
      const prev = prevRef.current.get(a.id);
      if (prev != null) {
        const up = a.direction === "above" && prev < a.price && cur >= a.price;
        const down = a.direction === "below" && prev > a.price && cur <= a.price;
        if (up || down) {
          fire(a, p);
          setAlertStatus(a.id, "triggered");
        }
      }
      prevRef.current.set(a.id, cur);
    }
  }, [prices, armed]);

  // Forget prev samples for deleted alerts.
  useEffect(() => {
    const ids = new Set(alerts.map((a) => a.id));
    for (const k of Array.from(prevRef.current.keys())) {
      if (!ids.has(k)) prevRef.current.delete(k);
    }
  }, [alerts]);

  return null;
}
