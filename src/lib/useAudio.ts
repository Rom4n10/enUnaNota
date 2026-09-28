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
 * Small pool of decoded previews. Prefetching the next round into it is what
 * removes the loading gap between songs.
 */
const POOL_SIZE = 5;
const pool = new Map<string, Howl>();

function acquire(url: string): Howl {
  const cached = pool.get(url);
  if (cached) {
    pool.delete(url);
    pool.set(url, cached);
    return cached;
  }
  const howl = new Howl({ src: [url], format: ["m4a", "mp4", "aac"], html5: false, preload: true });
  pool.set(url, howl);
  while (pool.size > POOL_SIZE) {
    const oldest = pool.keys().next().value;
    if (oldest === undefined || oldest === url) break;
    pool.get(oldest)?.unload();
    pool.delete(oldest);
  }
  return howl;
}

/** Downloads and decodes a preview ahead of time so playback starts instantly. */
export function preloadPreview(url: string | null | undefined): void {
  if (url) acquire(url);
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
    const howl = acquire(url);
    howlRef.current = howl;
    const onLoad = () => setLoaded({ url, status: "ready" });
    const onError = () => setLoaded({ url, status: "error" });
    const onEnd = () => setPlaying(null);
    if (howl.state() === "loaded") queueMicrotask(onLoad);
    howl.on("load", onLoad);
    howl.on("loaderror", onError);
    howl.on("playerror", onError);
    howl.on("end", onEnd);
    return () => {
      clearTimer();
      howl.off("load", onLoad);
      howl.off("loaderror", onError);
      howl.off("playerror", onError);
      howl.off("end", onEnd);
      howl.stop();
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
