"use client";

import { Howl, Howler } from "howler";
import { useCallback, useEffect, useRef, useState } from "react";

type Status = "idle" | "loading" | "ready" | "playing" | "error";

let analyser: AnalyserNode | null = null;

function getAnalyser(): AnalyserNode | null {
  const ctx = Howler.ctx;
  const master = Howler.masterGain;
  if (!ctx || !master) return null;
  if (!analyser) {
    analyser = ctx.createAnalyser();
    analyser.fftSize = 128;
    master.connect(analyser);
  }
  return analyser;
}

/**
 * Preview player with millisecond-accurate clipping: playback starts at the
 * requested offset and is cut by a scheduled timer, so a 800 ms snippet really
 * lasts 800 ms.
 */
export function usePreviewPlayer(url: string | null) {
  const howlRef = useRef<Howl | null>(null);
  const stopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const [loaded, setLoaded] = useState<{ url: string; status: "ready" | "error" } | null>(null);
  const [playing, setPlaying] = useState<{ url: string; clipMs: number } | null>(null);
  const [elapsedMs, setElapsedMs] = useState(0);

  const status: Status = !url
    ? "idle"
    : loaded?.url !== url
      ? "loading"
      : playing?.url === url
        ? "playing"
        : loaded.status;

  const clipMs = playing?.clipMs ?? 0;

  const clearTimer = () => {
    if (stopTimer.current) clearTimeout(stopTimer.current);
    stopTimer.current = null;
  };

  useEffect(() => {
    if (!url) return;
    const howl = new Howl({ src: [url], format: ["m4a", "mp4", "aac"], html5: false, preload: true });
    howl.once("load", () => setLoaded({ url, status: "ready" }));
    howl.on("loaderror", () => setLoaded({ url, status: "error" }));
    howl.on("playerror", () => setLoaded({ url, status: "error" }));
    howl.on("end", () => setPlaying(null));
    howlRef.current = howl;
    return () => {
      clearTimer();
      howl.unload();
      howlRef.current = null;
    };
  }, [url]);

  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const tick = () => {
      const howl = howlRef.current;
      if (howl) setElapsedMs(Number(howl.seek() || 0) * 1000);
      frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const stop = useCallback(() => {
    clearTimer();
    howlRef.current?.stop();
    setPlaying(null);
    setElapsedMs(0);
  }, []);

  /** Plays `ms` milliseconds from `fromMs` (or the whole preview when ms is null). */
  const playClip = useCallback(
    (ms: number | null = null, fromMs = 0) => {
      const howl = howlRef.current;
      if (!howl || !url) return;
      clearTimer();
      howl.stop();
      howl.seek(fromMs / 1000);
      howl.play();
      setPlaying({ url, clipMs: ms ?? 30_000 });
      if (ms !== null) {
        stopTimer.current = setTimeout(() => {
          howl.stop();
          setPlaying(null);
          setElapsedMs(0);
        }, ms);
      }
    },
    [url],
  );

  return { status, playClip, stop, elapsedMs, clipMs, getAnalyser };
}
