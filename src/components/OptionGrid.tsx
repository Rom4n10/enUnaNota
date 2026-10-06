"use client";

import { motion } from "motion/react";
import { Check, X } from "lucide-react";
import { useEffect, useRef } from "react";
import { celebrate, fail, originOf } from "@/lib/fx";
import type { Option } from "@/lib/types";

type Props = {
  options: Option[];
  onPick: (optionId: string) => void;
  disabledIds?: string[];
  correctId?: string | null;
  pickedId?: string | null;
  locked?: boolean;
};

export function OptionGrid({
  options,
  onPick,
  disabledIds = [],
  correctId = null,
  pickedId = null,
  locked = false,
}: Props) {
  const buttons = useRef(new Map<string, HTMLButtonElement>());
  const discardedCount = useRef(disabledIds.length);

  useEffect(() => {
    if (!correctId || !pickedId) return;
    if (correctId === pickedId) celebrate(originOf(buttons.current.get(correctId) ?? null));
    else fail();
  }, [correctId, pickedId]);

  useEffect(() => {
    if (disabledIds.length > discardedCount.current) fail();
    discardedCount.current = disabledIds.length;
  }, [disabledIds.length]);

  return (
    <div className="grid gap-2.5 sm:grid-cols-2 sm:gap-3">
      {options.map((option, index) => {
        const discarded = disabledIds.includes(option.id);
        const isCorrect = correctId === option.id;
        const isWrongPick = (pickedId === option.id && correctId !== null && !isCorrect) || discarded;
        const tone = isCorrect
          ? "border-lime bg-lime text-ink shadow-[0_4px_0_#7aa300,0_0_40px_-6px_rgba(200,255,46,0.7)]"
          : isWrongPick
            ? "border-coral/60 bg-coral/10 text-white/50 shadow-[0_4px_0_rgba(0,0,0,0.5)]"
            : pickedId === option.id
              ? "border-accent bg-accent/15 shadow-[0_4px_0_rgba(0,0,0,0.5)]"
              : "border-white/10 bg-surface-2 shadow-[0_4px_0_rgba(0,0,0,0.55)] hover:border-accent/70 hover:bg-white/[0.07]";
        const badge = isCorrect
          ? "bg-ink text-lime"
          : isWrongPick
            ? "bg-coral/20 text-coral"
            : "bg-white/8 text-white/50 group-hover:bg-accent group-hover:text-ink";

        return (
          <motion.button
            key={option.id}
            ref={(el) => {
              if (el) buttons.current.set(option.id, el);
              else buttons.current.delete(option.id);
            }}
            type="button"
            initial={{ opacity: 0, y: 16, scale: 0.96 }}
            animate={
              isCorrect
                ? { opacity: 1, y: 0, scale: [1, 1.06, 1], x: 0 }
                : isWrongPick
                  ? { opacity: 1, y: 0, scale: 1, x: [0, -9, 9, -6, 6, -2, 0] }
                  : { opacity: 1, y: 0, scale: 1, x: 0 }
            }
            transition={
              isCorrect || isWrongPick
                ? { duration: 0.45 }
                : { delay: index * 0.05, type: "spring", stiffness: 420, damping: 26 }
            }
            whileHover={locked || discarded ? undefined : { y: -2 }}
            whileTap={locked || discarded ? undefined : { scale: 0.96, y: 3 }}
            disabled={locked || discarded}
            onClick={() => onPick(option.id)}
            className={`group flex min-h-16 items-center gap-3 rounded-2xl border px-3.5 py-3 text-left text-[15px] font-bold leading-snug transition-colors ${tone}`}
          >
            <span
              className={`grid h-8 w-8 shrink-0 place-items-center rounded-xl font-display text-sm font-extrabold transition-colors ${badge}`}
            >
              {isCorrect ? (
                <Check size={18} strokeWidth={3} />
              ) : isWrongPick ? (
                <X size={18} strokeWidth={3} />
              ) : (
                String.fromCharCode(65 + index)
              )}
            </span>
            <span className={isWrongPick ? "line-through decoration-coral/60" : ""}>{option.label}</span>
          </motion.button>
        );
      })}
    </div>
  );
}
