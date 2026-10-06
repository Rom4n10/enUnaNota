"use client";

import { motion } from "motion/react";

/** Segmented progress: one pill per round, current one pulses. */
export function RoundProgress({ index, total }: { index: number; total: number }) {
  return (
    <div className="flex gap-1">
      {Array.from({ length: total }, (_, i) => (
        <motion.span
          key={i}
          animate={i === index ? { opacity: [0.5, 1, 0.5] } : { opacity: 1 }}
          transition={i === index ? { repeat: Infinity, duration: 1.4 } : undefined}
          className={`h-1.5 flex-1 rounded-full ${i < index ? "bg-accent" : i === index ? "bg-accent/60" : "bg-white/10"}`}
        />
      ))}
    </div>
  );
}
