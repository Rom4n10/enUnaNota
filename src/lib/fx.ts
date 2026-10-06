"use client";

import confetti from "canvas-confetti";
import { Howler } from "howler";

const PALETTE = ["#c8ff2e", "#ff3d8b", "#3db8ff", "#ffd23f", "#22e5a0", "#8c6cff"];

type Origin = { x: number; y: number };

function haptic(pattern: number | number[]): void {
  if (typeof navigator !== "undefined" && "vibrate" in navigator) navigator.vibrate(pattern);
}

function tone(freq: number, startIn: number, duration: number, type: OscillatorType, gain: number): void {
  const ctx = Howler.ctx;
  if (!ctx || ctx.state !== "running") return;
  const t = ctx.currentTime + startIn;
  const osc = ctx.createOscillator();
  const amp = ctx.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t);
  amp.gain.setValueAtTime(0.0001, t);
  amp.gain.exponentialRampToValueAtTime(gain, t + 0.012);
  amp.gain.exponentialRampToValueAtTime(0.0001, t + duration);
  osc.connect(amp).connect(ctx.destination);
  osc.start(t);
  osc.stop(t + duration + 0.02);
}

/** Center of an element in the 0..1 viewport space canvas-confetti expects. */
export function originOf(el: Element | null): Origin | undefined {
  if (!el) return undefined;
  const r = el.getBoundingClientRect();
  return { x: (r.left + r.width / 2) / window.innerWidth, y: (r.top + r.height / 2) / window.innerHeight };
}

export function celebrate(origin?: Origin, big = false): void {
  tone(784, 0, 0.16, "triangle", 0.09);
  tone(1047, 0.08, 0.18, "triangle", 0.09);
  tone(1319, 0.16, 0.3, "triangle", 0.08);
  haptic(25);
  void confetti({
    particleCount: big ? 160 : 55,
    spread: big ? 110 : 70,
    startVelocity: big ? 45 : 32,
    ticks: big ? 220 : 140,
    scalar: 0.9,
    origin: origin ?? { x: 0.5, y: 0.6 },
    colors: PALETTE,
    disableForReducedMotion: true,
  });
}

export function fail(): void {
  tone(220, 0, 0.14, "square", 0.035);
  tone(165, 0.1, 0.22, "square", 0.035);
  haptic([35, 40, 35]);
}

export function tick(): void {
  tone(1200, 0, 0.05, "sine", 0.03);
  haptic(8);
}

export function buzz(): void {
  tone(523, 0, 0.12, "sawtooth", 0.05);
  tone(784, 0.05, 0.18, "sawtooth", 0.045);
  haptic(60);
}
