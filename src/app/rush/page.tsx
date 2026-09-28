"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { Waveform } from "@/components/Waveform";
import { answerRound, getCategories, getRound } from "@/lib/api";
import { updateProfile } from "@/lib/storage";
import type { Category, RoundPayload } from "@/lib/types";
import { usePreviewPlayer } from "@/lib/useAudio";
import { useProfile } from "@/lib/useProfile";

const START_MS = 45_000;
const BONUS_MS = 4_000;
const PENALTY_MS = 6_000;
const FEVER_WINDOW_MS = 2_000;
const FEVER_DURATION_MS = 12_000;

type Phase = "setup" | "playing" | "over";

export default function RushPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("pop-global");
  const [phase, setPhase] = useState<Phase>("setup");
  const [timeLeft, setTimeLeft] = useState(START_MS);
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [discarded, setDiscarded] = useState<string[]>([]);
  const [score, setScore] = useState(0);
  const [solved, setSolved] = useState(0);
  const [combo, setCombo] = useState(0);
  const [fever, setFever] = useState(false);
  const [flash, setFlash] = useState<{ text: string; good: boolean } | null>(null);
  const seen = useRef<number[]>([]);
  const roundStartedAt = useRef(0);
  const deadline = useRef(0);
  const feverTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);
  const best = useProfile().rushBest;

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const nextRound = useCallback(async () => {
    try {
      const payload = await getRound(categoryId, seen.current.slice(-40));
      if (payload.trackId) seen.current.push(payload.trackId);
      setDiscarded([]);
      setRound(payload);
      roundStartedAt.current = Date.now();
    } catch {
      setFlash({ text: "Error cargando el tema", good: false });
    }
  }, [categoryId]);

  useEffect(() => {
    if (phase !== "playing" || status !== "ready") return;
    playClip(null);
  }, [phase, status, playClip]);

  useEffect(() => {
    if (phase !== "playing") return;
    const id = setInterval(() => {
      const left = deadline.current - Date.now();
      setTimeLeft(Math.max(0, left));
      if (left <= 0) {
        clearInterval(id);
        stop();
        setPhase("over");
        updateProfile({ rushBest: Math.max(best, score) });
      }
    }, 100);
    return () => clearInterval(id);
  }, [phase, score, best, stop]);

  async function start() {
    seen.current = [];
    setScore(0);
    setSolved(0);
    setCombo(0);
    setFever(false);
    setTimeLeft(START_MS);
    deadline.current = Date.now() + START_MS;
    setPhase("playing");
    await nextRound();
  }

  async function pick(optionId: string) {
    if (!round || phase !== "playing") return;
    const res = await answerRound(round.roundId, optionId);
    if (res.correct) {
      const elapsed = Date.now() - roundStartedAt.current;
      const quick = elapsed < FEVER_WINDOW_MS;
      const nextCombo = quick ? combo + 1 : 0;
      setCombo(nextCombo);
      if (nextCombo >= 3) {
        setFever(true);
        if (feverTimer.current) clearTimeout(feverTimer.current);
        feverTimer.current = setTimeout(() => setFever(false), FEVER_DURATION_MS);
      }
      const points = Math.round((100 + Math.max(0, 200 - elapsed / 10)) * (fever ? 2 : 1));
      setScore((s) => s + points);
      setSolved((s) => s + 1);
      deadline.current += BONUS_MS;
      setFlash({ text: `+${points} · +4s`, good: true });
      stop();
      await nextRound();
    } else {
      setCombo(0);
      deadline.current -= PENALTY_MS;
      setDiscarded((d) => [...d, optionId]);
      setFlash({ text: "-6s", good: false });
    }
    setTimeout(() => setFlash(null), 900);
  }

  if (phase === "setup") {
    return (
      <Shell>
        <section className="card space-y-4 p-5">
          <h1 className="text-2xl font-black">⏱️ Modo Rush</h1>
          <p className="text-sm text-white/60">
            45 segundos en el reloj global. Cada acierto suma 4 segundos, cada error resta 6 y
            descarta esa opción. Tres aciertos seguidos en menos de 2 segundos activan el modo
            Fiebre (x2 puntos).
          </p>
          <div>
            <p className="mb-2 text-xs uppercase tracking-widest text-white/40">Categoría</p>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCategoryId(c.id)}
                  className={`rounded-full border px-4 py-2 text-sm transition ${
                    c.id === categoryId
                      ? "border-fuchsia-400/70 bg-fuchsia-500/20"
                      : "border-white/12 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {c.emoji} {c.name}
                </button>
              ))}
            </div>
          </div>
          {best > 0 && <p className="text-sm text-amber-200">Tu récord: {best} puntos</p>}
          <button type="button" className="btn-primary w-full" onClick={start}>
            Arrancar
          </button>
        </section>
      </Shell>
    );
  }

  if (phase === "over") {
    return (
      <Shell>
        <section className="card space-y-4 p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">Se acabó el tiempo</p>
          <p className="text-5xl font-black text-fuchsia-300">{score}</p>
          <p className="text-white/60">{solved} canciones adivinadas · récord {best}</p>
          <button type="button" className="btn-primary w-full" onClick={start}>
            Revancha
          </button>
        </section>
      </Shell>
    );
  }

  const urgency = timeLeft < 10_000;

  return (
    <Shell>
      <section className={`card space-y-4 p-5 ${fever ? "ring-2 ring-amber-400/60" : ""}`}>
        <div className="flex items-baseline justify-between">
          <motion.span
            key={urgency ? "urgent" : "calm"}
            animate={urgency ? { scale: [1, 1.06, 1] } : { scale: 1 }}
            transition={{ repeat: urgency ? Infinity : 0, duration: 0.8 }}
            className={`text-4xl font-black tabular-nums ${urgency ? "text-rose-400" : ""}`}
          >
            {(timeLeft / 1000).toFixed(1)}s
          </motion.span>
          <div className="text-right">
            <p className="text-2xl font-bold tabular-nums">{score}</p>
            <p className="text-xs uppercase tracking-widest text-white/40">
              {fever ? "🔥 Fiebre x2" : `Combo ${combo}`}
            </p>
          </div>
        </div>

        <div className="rounded-2xl bg-black/30 p-2">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color={fever ? "#fbbf24" : "#c084fc"} />
        </div>

        <AnimatePresence>
          {flash && (
            <motion.p
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className={`text-center text-lg font-bold ${flash.good ? "text-lime-300" : "text-rose-300"}`}
            >
              {flash.text}
            </motion.p>
          )}
        </AnimatePresence>

        {round && (
          <OptionGrid options={round.options} onPick={pick} disabledIds={discarded} />
        )}
      </section>
    </Shell>
  );
}
