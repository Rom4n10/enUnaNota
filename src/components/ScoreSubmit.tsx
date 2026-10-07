"use client";

import { motion } from "motion/react";
import { LoaderCircle, Upload } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { accentStyle } from "@/lib/modes";
import { updateProfile } from "@/lib/storage";
import type { ScoreEntry } from "@/lib/types";
import { useProfile } from "@/lib/useProfile";

type Result = { rank: number | null; top: ScoreEntry[] };

type Props = {
  submit: (name: string) => Promise<Result>;
  onResult: (result: Result) => void;
  resultText: (rank: number | null) => string;
};

/**
 * Publishes the score as soon as the player has a nickname. The first time it asks
 * for one; after that every finished game goes to the ranking on its own.
 */
export function ScoreSubmit({ submit, onResult, resultText }: Props) {
  const nickname = useProfile().nickname;
  const [typed, setTyped] = useState("");
  const [result, setResult] = useState<{ rank: number | null; failed: boolean } | null>(null);
  const sent = useRef(false);
  const latest = useRef({ submit, onResult });

  useEffect(() => {
    latest.current = { submit, onResult };
  });

  useEffect(() => {
    if (!nickname || sent.current) return;
    sent.current = true;
    latest.current
      .submit(nickname)
      .then((r) => {
        setResult({ rank: r.rank, failed: false });
        latest.current.onResult(r);
      })
      .catch(() => setResult({ rank: null, failed: true }));
  }, [nickname]);

  if (result) {
    return (
      <motion.p
        initial={{ scale: 0.8, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        className="pill mx-auto"
        style={accentStyle(result.failed ? "#ff3d8b" : "#c8ff2e")}
      >
        {result.failed ? "No pudimos publicar tu puntaje" : `${resultText(result.rank)} · ${nickname}`}
      </motion.p>
    );
  }

  if (nickname) {
    return (
      <p className="flex items-center justify-center gap-2 text-sm text-white/60">
        <LoaderCircle size={16} strokeWidth={2.6} className="animate-spin" />
        Publicando como {nickname}…
      </p>
    );
  }

  const clean = typed.trim();
  return (
    <form
      className="space-y-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (clean) updateProfile({ nickname: clean });
      }}
    >
      <p className="text-sm text-white/60">Elegí tu apodo y desde ahora tus puntajes se publican solos.</p>
      <div className="flex gap-2">
        <input
          value={typed}
          onChange={(e) => setTyped(e.target.value)}
          placeholder="Tu apodo"
          maxLength={16}
          className="field min-w-0 flex-1 py-3"
        />
        <button type="submit" className="btn-ghost" disabled={!clean}>
          <Upload size={17} strokeWidth={2.6} />
          Publicar
        </button>
      </div>
    </form>
  );
}
