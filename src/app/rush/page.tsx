"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { Waveform } from "@/components/Waveform";
import { answerRound, getCategories, getLeaderboard, getRound, submitScore } from "@/lib/api";
import { updateProfile } from "@/lib/storage";
import type { Category, RoundPayload, ScoreEntry } from "@/lib/types";
import { preloadPreview, usePreviewPlayer } from "@/lib/useAudio";
import { useProfile } from "@/lib/useProfile";

const START_MS = 45_000;
const BONUS_MS = 4_000;
const PENALTY_MS = 6_000;
const FEVER_WINDOW_MS = 2_000;
const FEVER_DURATION_MS = 12_000;

type Phase = "setup" | "playing" | "over";

function Leaderboard({ entries }: { entries: ScoreEntry[] }) {
  if (!entries.length) return null;
  return (
    <div className="space-y-1 text-left">
      <p className="text-xs uppercase tracking-widest text-white/40">Ranking de la semana</p>
      {entries.slice(0, 5).map((entry, i) => (
        <div key={`${entry.name}-${entry.at}`} className="flex justify-between text-sm">
          <span className="text-white/70">
            {i + 1}. {entry.name}
          </span>
          <span className="tabular-nums font-semibold">{entry.score}</span>
        </div>
      ))}
    </div>
  );
}

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
  const prefetched = useRef<Promise<RoundPayload> | null>(null);
  const [top, setTop] = useState<ScoreEntry[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);

  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);
  const profile = useProfile();
  const best = profile.rushBest;
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? profile.nickname;

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (phase === "playing") return;
    getLeaderboard("rush", categoryId)
      .then((r) => setTop(r.top))
      .catch(() => setTop([]));
  }, [categoryId, phase]);

  /** Requests a round and warms its audio so the next song starts with no gap. */
  const fetchRound = useCallback(() => {
    const pending = getRound(categoryId, seen.current.slice(-40));
    pending
      .then((payload) => {
        if (payload.trackId) seen.current.push(payload.trackId);
        preloadPreview(payload.audioUrl);
      })
      .catch(() => {});
    return pending;
  }, [categoryId]);

  const nextRound = useCallback(async () => {
    try {
      const payload = await (prefetched.current ?? fetchRound());
      prefetched.current = fetchRound();
      setDiscarded([]);
      setRound(payload);
      roundStartedAt.current = Date.now();
    } catch {
      prefetched.current = null;
      setFlash({ text: "Error cargando el tema", good: false });
    }
  }, [fetchRound]);

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
    prefetched.current = null;
    setScore(0);
    setSolved(0);
    setRank(null);
    setSubmitted(false);
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
      const feverActive = fever || nextCombo >= 3;
      const points = Math.round((100 + Math.max(0, 200 - elapsed / 10)) * (feverActive ? 2 : 1));
      setScore((s) => s + points);
      setSolved((s) => s + 1);
      deadline.current += BONUS_MS;
      setFlash({ text: `+${points} · +4s · ${res.solution.title}`, good: true });
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
          <Leaderboard entries={top} />
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
          {submitted ? (
            <p className="text-sm text-lime-300">
              {rank ? `Entraste #${rank} en el ranking semanal` : "Esta vez no entraste al top 50"}
            </p>
          ) : (
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Tu apodo"
                maxLength={16}
                className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 outline-none placeholder:text-white/30 focus:border-fuchsia-400/60"
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={!name.trim()}
                onClick={async () => {
                  updateProfile({ nickname: name.trim() });
                  try {
                    const r = await submitScore({
                      mode: "rush",
                      categoryId,
                      name: name.trim(),
                      score,
                    });
                    setRank(r.rank);
                    setTop(r.top);
                  } catch {
                    setRank(null);
                  }
                  setSubmitted(true);
                }}
              >
                Subir
              </button>
            </div>
          )}
          <Leaderboard entries={top} />
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
