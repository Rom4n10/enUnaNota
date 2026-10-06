"use client";

import { motion } from "motion/react";
import { Trophy } from "lucide-react";
import type { ScoreEntry } from "@/lib/types";

const PLACE = ["bg-yellow text-ink", "bg-white/80 text-ink", "bg-orange text-ink"];

export function Leaderboard({ entries, title = "Ranking de la semana" }: { entries: ScoreEntry[]; title?: string }) {
  if (!entries.length) return null;
  return (
    <div className="space-y-2 text-left">
      <p className="eyebrow flex items-center gap-1.5">
        <Trophy size={13} strokeWidth={2.6} />
        {title}
      </p>
      <ol className="space-y-1.5">
        {entries.slice(0, 5).map((entry, i) => (
          <motion.li
            key={`${entry.name}-${entry.at}`}
            layout
            initial={{ opacity: 0, x: -10 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ delay: i * 0.05 }}
            className="flex items-center gap-3 rounded-xl bg-white/[0.04] px-3 py-2 text-sm"
          >
            <span
              className={`grid h-6 w-6 place-items-center rounded-lg font-display text-xs font-extrabold ${
                PLACE[i] ?? "bg-white/10 text-white/60"
              }`}
            >
              {i + 1}
            </span>
            <span className="flex-1 truncate font-semibold text-white/80">{entry.name}</span>
            <span className="font-display font-bold tabular-nums">{entry.score.toLocaleString("es-AR")}</span>
          </motion.li>
        ))}
      </ol>
    </div>
  );
}
