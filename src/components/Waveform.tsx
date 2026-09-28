"use client";

import { useEffect, useRef } from "react";

type Props = {
  active: boolean;
  getAnalyser: () => AnalyserNode | null;
  color?: string;
  bars?: number;
};

export function Waveform({ active, getAnalyser, color = "#c084fc", bars = 48 }: Props) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const levels = useRef<number[]>(Array.from({ length: bars }, () => 0.06));

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    let frame = 0;
    let phase = 0;

    const draw = () => {
      const dpr = window.devicePixelRatio || 1;
      const { clientWidth: w, clientHeight: h } = canvas;
      if (canvas.width !== w * dpr || canvas.height !== h * dpr) {
        canvas.width = w * dpr;
        canvas.height = h * dpr;
      }
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, w, h);

      const analyser = active ? getAnalyser() : null;
      let data: Uint8Array<ArrayBuffer> | null = null;
      if (analyser) {
        data = new Uint8Array(new ArrayBuffer(analyser.frequencyBinCount));
        analyser.getByteFrequencyData(data);
      }
      phase += 0.08;

      const barWidth = w / bars;
      for (let i = 0; i < bars; i++) {
        const target = data
          ? Math.max(0.06, data[Math.floor((i / bars) * data.length)] / 255)
          : active
            ? 0.25 + 0.2 * Math.sin(phase + i * 0.4)
            : 0.06;
        levels.current[i] += (target - levels.current[i]) * 0.35;
        const barHeight = Math.max(3, levels.current[i] * h);
        const x = i * barWidth;
        const y = (h - barHeight) / 2;
        ctx.fillStyle = color;
        ctx.globalAlpha = 0.35 + levels.current[i] * 0.65;
        ctx.beginPath();
        ctx.roundRect(x + barWidth * 0.2, y, barWidth * 0.6, barHeight, 99);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      frame = requestAnimationFrame(draw);
    };

    frame = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(frame);
  }, [active, bars, color, getAnalyser]);

  return <canvas ref={canvasRef} className="h-20 w-full" aria-hidden />;
}
