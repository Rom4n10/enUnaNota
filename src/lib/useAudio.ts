"use client";

import { Howl, Howler } from "howler";
import { useCallback, useEffect, useRef, useState } from "react";

export type Status = "idle" | "loading" | "ready" | "playing" | "error";

// The default 30s auto-suspend silently mutes the next clip on mobile browsers that refuse to
// resume an AudioContext outside a user gesture (e.g. a round started by a socket event).
Howler.autoSuspend = false;

const MAX_RETRIES = 2;

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
/** Previews currently bound to a mounted player; never evicted while in use. */
const pinned = new Map<string, number>();

function pin(url: string): () => void {
  pinned.set(url, (pinned.get(url) ?? 0) + 1);
  return () => {
    const left = (pinned.get(url) ?? 1) - 1;
    if (left > 0) pinned.set(url, left);
    else pinned.delete(url);
  };
}

function evict(url: string): void {
  pool.get(url)?.unload();
  pool.delete(url);
}

function acquire(url: string): Howl {
  const cached = pool.get(url);
  if (cached && cached.state() === "unloaded") pool.delete(url);
  else if (cached) {
    pool.delete(url);
    pool.set(url, cached);
    return cached;
  }
  const howl = new Howl({ src: [url], format: ["m4a", "mp4", "aac"], html5: false, preload: true });
  pool.set(url, howl);
  const evictable = [...pool.keys()].filter((key) => key !== url && !pinned.has(key));
  while (pool.size > POOL_SIZE && evictable.length) evict(evictable.shift() as string);
  return howl;
}

/** Resumes the shared AudioContext; must run inside a user gesture on iOS Safari. */
export function unlockAudio(): void {
  const ctx = Howler.ctx;
  if (ctx && ctx.state !== "running") void ctx.resume().catch(() => {});
}

export function audioLocked(): boolean {
  const ctx = Howler.ctx;
  return Boolean(ctx && ctx.state !== "running");
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
  const [attempt, setAttempt] = useState<{ url: string; n: number }>({ url: "", n: 0 });
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

  const tries = attempt.url === url ? attempt.n : 0;

  useEffect(() => {
    if (!url) return;
    const release = pin(url);
    const howl = acquire(url);
    howlRef.current = howl;
    const onLoad = () => setLoaded({ url, status: "ready" });
    // Transient upstream failures are common on iTunes' CDN: drop the broken Howl and retry.
    const onError = () => {
      if (tries < MAX_RETRIES) {
        evict(url);
        setTimeout(() => setAttempt({ url, n: tries + 1 }), 400 * (tries + 1));
        return;
      }
      setLoaded({ url, status: "error" });
    };
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
      release();
    };
  }, [url, tries]);

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
      unlockAudio();
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

/** Plays each new preview once as soon as it is decoded, never replaying it after a stop(). */
export function useAutoplay(
  status: Status,
  url: string | null,
  enabled: boolean,
  play: () => void,
): void {
  const played = useRef<string | null>(null);
  useEffect(() => {
    if (!enabled || !url || status !== "ready" || played.current === url) return;
    played.current = url;
    play();
  }, [enabled, url, status, play]);
}
