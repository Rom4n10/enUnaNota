"use client";

import { motion } from "framer-motion";
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
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {options.map((option, index) => {
        const discarded = disabledIds.includes(option.id);
        const isCorrect = correctId === option.id;
        const isWrongPick = pickedId === option.id && correctId !== null && !isCorrect;
        const tone = isCorrect
          ? "border-lime-400/70 bg-lime-400/15"
          : isWrongPick
            ? "border-rose-400/70 bg-rose-400/15"
            : discarded
              ? "border-white/5 bg-white/[0.02] opacity-40"
              : "border-white/12 bg-white/5 hover:bg-white/10";

        return (
          <motion.button
            key={option.id}
            type="button"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: index * 0.05 }}
            whileTap={{ scale: 0.97 }}
            disabled={locked || discarded}
            onClick={() => onPick(option.id)}
            className={`rounded-2xl border px-4 py-4 text-left text-sm font-medium leading-snug transition ${tone}`}
          >
            <span className="mr-2 text-white/40">{String.fromCharCode(65 + index)}</span>
            {option.label}
          </motion.button>
        );
      })}
    </div>
  );
}
