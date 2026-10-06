"use client";

import { motion } from "motion/react";
import { Check, X } from "lucide-react";

type Props = {
  title: string;
  artist: string;
  artwork?: string | null;
  year?: number | null;
  ok?: boolean;
};

export function SolutionCard({ title, artist, artwork, year, ok }: Props) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 14, scale: 0.96 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: -8 }}
      transition={{ type: "spring", stiffness: 380, damping: 26 }}
      className="flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-2.5"
    >
      {artwork ? (
        <motion.img
          initial={{ rotate: -12, scale: 0.6 }}
          animate={{ rotate: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 300, damping: 14 }}
          src={artwork}
          alt=""
          className="h-14 w-14 shrink-0 rounded-xl shadow-lg"
        />
      ) : (
        <span className="h-14 w-14 shrink-0 rounded-xl bg-white/10" />
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate font-display text-base font-bold leading-tight">{title}</p>
        <p className="truncate text-sm text-white/60">
          {artist}
          {year ? ` · ${year}` : ""}
        </p>
      </div>
      {ok !== undefined && (
        <span
          className={`grid h-9 w-9 shrink-0 place-items-center rounded-xl ${
            ok ? "bg-lime text-ink" : "bg-coral/20 text-coral"
          }`}
        >
          {ok ? <Check size={20} strokeWidth={3} /> : <X size={20} strokeWidth={3} />}
        </span>
      )}
    </motion.div>
  );
}
