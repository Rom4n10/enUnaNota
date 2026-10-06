"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { modeOf, type ModeId } from "@/lib/modes";

export function ModeHeader({ id, children }: { id: ModeId; children?: ReactNode }) {
  const mode = modeOf(id);
  const Icon = mode.icon;
  return (
    <div className="flex items-start gap-4">
      <motion.span
        initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
        animate={{ scale: 1, rotate: 0, opacity: 1 }}
        transition={{ type: "spring", stiffness: 380, damping: 16 }}
        className="tile h-14 w-14 shrink-0"
      >
        <Icon size={28} strokeWidth={2.4} />
      </motion.span>
      <div className="space-y-1">
        <p className="eyebrow">{mode.tagline}</p>
        <h1 className="font-display text-3xl font-extrabold leading-none sm:text-4xl">{mode.title}</h1>
        {children && <p className="pt-1 text-sm leading-relaxed text-white/60">{children}</p>}
      </div>
    </div>
  );
}
