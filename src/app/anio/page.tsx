"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { Waveform } from "@/components/Waveform";
import {
  answerRound,
  getCategories,
  getLeaderboard,
  getYearRound,
  submitScore,
} from "@/lib/api";
import { updateProfile } from "@/lib/storage";
import type { Category, RoundPayload, ScoreEntry, Solution } from "@/lib/types";
import { preloadPreview, useAutoplay, usePreviewPlayer } from "@/lib/useAudio";
import { useProfile } from "@/lib/useProfile";

const TOTAL_ROUNDS = 10;
const CLIP_MS = 8_000;

type Phase = "setup" | "playing" | "over";

export default function YearPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("pop-global");
  const [phase, setPhase] = useState<Phase>("setup");
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [top, setTop] = useState<ScoreEntry[]>([]);
  const [rank, setRank] = useState<number | null>(null);
  const [submitted, setSubmitted] = useState(false);
  const seen = useRef<number[]>([]);
  const prefetched = useRef<Promise<RoundPayload> | null>(null);

  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);
  const profile = useProfile();
  const [typedName, setTypedName] = useState<string | null>(null);
  const name = typedName ?? profile.nickname;

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    if (phase === "playing") return;
    getLeaderboard("year", categoryId)
      .then((r) => setTop(r.top))
      .catch(() => setTop([]));
  }, [categoryId, phase]);

  const fetchRound = useCallback(() => {
    const pending = getYearRound(categoryId, seen.current.slice(-40));
    pending
      .then((payload) => {
        if (payload.trackId) seen.current.push(payload.trackId);
        preloadPreview(payload.audioUrl);
      })
      .catch(() => {});
    return pending;
  }, [categoryId]);

  const nextRound = useCallback(async () => {
    const payload = await (prefetched.current ?? fetchRound());
    prefetched.current = fetchRound();
    setPicked(null);
    setSolution(null);
    setRound(payload);
  }, [fetchRound]);

  useAutoplay(status, round?.audioUrl ?? null, phase === "playing" && !solution, () =>
    playClip(CLIP_MS),
  );

  async function start() {
    seen.current = [];
    prefetched.current = null;
    setScore(0);
    setIndex(0);
    setRank(null);
    setSubmitted(false);
    setPhase("playing");
    await nextRound();
  }

  async function pick(optionId: string) {
    if (!round || picked) return;
    setPicked(optionId);
    stop();
    const res = await answerRound(round.roundId, optionId);
    setSolution(res.solution);
    if (res.correct) setScore((s) => s + 1);
    setTimeout(async () => {
      if (index + 1 >= TOTAL_ROUNDS) {
        setPhase("over");
        setRound(null);
        return;
      }
      setIndex((i) => i + 1);
      await nextRound();
    }, 2200);
  }

  if (phase === "setup") {
    return (
      <Shell>
        <section className="card space-y-4 p-5">
          <h1 className="text-2xl font-black">📅 Adiviná el año</h1>
          <p className="text-sm text-white/60">
            8 segundos de cada tema y cuatro años posibles. Diez canciones para demostrar que
            sabés en qué época sonaba cada hit.
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
          <button type="button" className="btn-primary w-full" onClick={start}>
            Arrancar
          </button>
          {top.length > 0 && (
            <div className="space-y-1">
              <p className="text-xs uppercase tracking-widest text-white/40">Ranking de la semana</p>
              {top.slice(0, 5).map((entry, i) => (
                <div key={`${entry.name}-${entry.at}`} className="flex justify-between text-sm">
                  <span className="text-white/70">
                    {i + 1}. {entry.name}
                  </span>
                  <span className="tabular-nums font-semibold">{entry.score}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </Shell>
    );
  }

  if (phase === "over") {
    return (
      <Shell>
        <section className="card space-y-4 p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">Terminaste</p>
          <p className="text-5xl font-black text-sky-300">
            {score}/{TOTAL_ROUNDS}
          </p>
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
                className="min-w-0 flex-1 rounded-2xl border border-white/12 bg-white/5 px-4 py-3 outline-none placeholder:text-white/30 focus:border-sky-400/60"
              />
              <button
                type="button"
                className="btn-ghost"
                disabled={!name.trim()}
                onClick={async () => {
                  updateProfile({ nickname: name.trim() });
                  try {
                    const r = await submitScore({ mode: "year", categoryId, name: name.trim(), score });
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
          <button type="button" className="btn-primary w-full" onClick={start}>
            Otra vuelta
          </button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
          <span>
            Tema {index + 1} / {TOTAL_ROUNDS}
          </span>
          <span className="tabular-nums">{score} aciertos</span>
        </div>

        <div className="rounded-2xl bg-black/30 p-2">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#38bdf8" />
        </div>

        {round && (
          <OptionGrid
            options={round.options}
            onPick={pick}
            pickedId={picked}
            correctId={solution?.correctOptionId ?? null}
            locked={Boolean(picked)}
          />
        )}

        <AnimatePresence>
          {solution && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0 }}
              className="flex items-center gap-3"
            >
              {solution.artwork && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={solution.artwork} alt="" className="h-12 w-12 rounded-xl" />
              )}
              <div className="text-sm">
                <p className="font-bold">
                  {solution.title} {solution.year ? `(${solution.year})` : ""}
                </p>
                <p className="text-white/60">{solution.artist}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </Shell>
  );
}
