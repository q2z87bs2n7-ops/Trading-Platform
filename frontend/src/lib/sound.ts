// Short, sharp alert chime via the Web Audio API — no audio asset, no third
// party. Deliberately a quick two-tone "ding-ding", not a sustained alarm.
//
// Browser autoplay policy suspends an AudioContext until a user gesture, so
// initAlertSound() primes it on the first pointer/key event; playAlertChime()
// also attempts a resume() as a fallback.

let ctx: AudioContext | null = null;
let primed = false;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext })
        .webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

// Attach a one-shot gesture listener so the context is unlocked before the
// first alert ever fires (alerts fire on a timer, which is not a gesture).
export function initAlertSound(): void {
  if (primed || typeof window === "undefined") return;
  primed = true;
  const unlock = () => {
    const c = getCtx();
    if (c && c.state === "suspended") void c.resume();
    window.removeEventListener("pointerdown", unlock);
    window.removeEventListener("keydown", unlock);
  };
  window.addEventListener("pointerdown", unlock, { once: true });
  window.addEventListener("keydown", unlock, { once: true });
}

export function playAlertChime(): void {
  const c = getCtx();
  if (!c) return;
  if (c.state === "suspended") void c.resume();
  const now = c.currentTime;
  // Two short tones a fifth apart — sharp and attention-getting, ~0.2s total.
  const tones: [number, number][] = [
    [880, 0],
    [1320, 0.09],
  ];
  for (const [freq, t] of tones) {
    const osc = c.createOscillator();
    const gain = c.createGain();
    osc.type = "triangle"; // softer edge than square, still crisp
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, now + t);
    gain.gain.exponentialRampToValueAtTime(0.25, now + t + 0.012);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + t + 0.12);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(now + t);
    osc.stop(now + t + 0.14);
  }
}
