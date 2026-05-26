import { useCallback, useEffect, useRef, useState } from "react";

// Web Speech API isn't in lib.dom.d.ts yet; minimal typing for what we use.
interface SpeechRecognitionResultLike {
  isFinal: boolean;
  0: { transcript: string };
}
interface SpeechRecognitionEventLike {
  resultIndex: number;
  results: ArrayLike<SpeechRecognitionResultLike>;
}
interface SpeechRecognitionErrorEventLike {
  error: string;
}
interface SpeechRecognitionLike {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((e: SpeechRecognitionEventLike) => void) | null;
  onerror: ((e: SpeechRecognitionErrorEventLike) => void) | null;
  onend: (() => void) | null;
}
type SpeechRecognitionCtor = new () => SpeechRecognitionLike;

function getCtor(): SpeechRecognitionCtor | null {
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

interface Options {
  // Called on every finalized chunk with a space-prefixed delta to append.
  onAppend: (delta: string) => void;
  // Called with the live interim transcript (no leading space). Use to show
  // a soft preview; cleared on finalize.
  onInterim?: (text: string) => void;
  lang?: string;
}

interface Result {
  supported: boolean;
  listening: boolean;
  error: string | null;
  start: () => void;
  stop: () => void;
  toggle: () => void;
}

// Thin wrapper around the browser's SpeechRecognition. No infra cost, no
// network round-trip beyond the browser's own provider. Firefox is the
// notable gap; supported on Chrome / Edge / Safari (incl. iOS 14.5+).
export function useSpeechToText({ onAppend, onInterim, lang = "en-US" }: Options): Result {
  const [supported] = useState<boolean>(() => getCtor() !== null);
  const [listening, setListening] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const recRef = useRef<SpeechRecognitionLike | null>(null);
  // Hold the latest callbacks in refs so we don't re-create the recognizer
  // on every parent render (which would interrupt an in-flight session).
  const appendRef = useRef(onAppend);
  const interimRef = useRef(onInterim);
  useEffect(() => { appendRef.current = onAppend; }, [onAppend]);
  useEffect(() => { interimRef.current = onInterim; }, [onInterim]);

  useEffect(() => {
    return () => {
      try { recRef.current?.abort(); } catch { /* noop */ }
      recRef.current = null;
    };
  }, []);

  const start = useCallback(() => {
    if (recRef.current) return;
    const Ctor = getCtor();
    if (!Ctor) return;
    setError(null);
    const rec = new Ctor();
    rec.lang = lang;
    rec.continuous = true;
    rec.interimResults = true;
    rec.onresult = (e: SpeechRecognitionEventLike) => {
      let interim = "";
      let finalDelta = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        const r = e.results[i];
        const t = r[0].transcript;
        if (r.isFinal) finalDelta += t;
        else interim += t;
      }
      if (finalDelta) {
        appendRef.current(finalDelta.startsWith(" ") ? finalDelta : ` ${finalDelta}`);
        interimRef.current?.("");
      } else if (interim) {
        interimRef.current?.(interim);
      }
    };
    rec.onerror = (e: SpeechRecognitionErrorEventLike) => {
      // "no-speech" / "aborted" are normal end states, not user-facing errors.
      if (e.error !== "no-speech" && e.error !== "aborted") {
        setError(e.error || "speech error");
      }
    };
    rec.onend = () => {
      recRef.current = null;
      setListening(false);
      interimRef.current?.("");
    };
    try {
      rec.start();
      recRef.current = rec;
      setListening(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "could not start");
    }
  }, [lang]);

  const stop = useCallback(() => {
    try { recRef.current?.stop(); } catch { /* noop */ }
  }, []);

  const toggle = useCallback(() => {
    if (recRef.current) stop();
    else start();
  }, [start, stop]);

  return { supported, listening, error, start, stop, toggle };
}
