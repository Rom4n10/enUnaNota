"use client";

import { AnimatePresence, motion } from "motion/react";
import { RotateCcw, Upload } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Leaderboard } from "@/components/Leaderboard";
import { ModeHeader } from "@/components/ModeHeader";
import { RoundProgress } from "@/components/RoundProgress";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { SolutionCard } from "@/components/SolutionCard";
import { Waveform } from "@/components/Waveform";
import { celebrate } from "@/lib/fx";
import { accentStyle, modeOf } from "@/lib/modes";
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
import { useGameLog } from "@/lib/useGameLog";
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
  useGameLog(phase === "over", { mode: "anio", categoryId, score });
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
        celebrate(undefined, true);
        setPhase("over");
        setRound(null);
        return;
      }
      setIndex((i) => i + 1);
      await nextRound();
    }, 2200);
  }

  const accent = accentStyle(modeOf("anio").color);

  if (phase === "setup") {
    return (
      <Shell style={accent}>
        <ModeHeader id="anio">
          8 segundos de cada tema y cuatro años posibles. Diez canciones para demostrar que sabés en qué época sonaba
          cada hit.
        </ModeHeader>
        <section className="card space-y-5 p-5 sm:p-6">
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          <button type="button" className="btn-accent w-full text-lg" onClick={start}>
            Arrancar
          </button>
          <Leaderboard entries={top} />
        </section>
      </Shell>
    );
  }

  if (phase === "over") {
    return (
      <Shell style={accent}>
        <motion.section
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 20 }}
          className="card space-y-5 p-6 text-center"
        >
          <p className="eyebrow">Terminaste</p>
          <p className="font-display text-7xl font-extrabold text-accent">
            <AnimatedNumber value={score} />
            <span className="text-3xl text-white/40">/{TOTAL_ROUNDS}</span>
          </p>
          {submitted ? (
            <motion.p initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} className="pill mx-auto" style={accentStyle("#c8ff2e")}>
              {rank ? `Entraste #${rank} en el ranking semanal` : "Esta vez no entraste al top 50"}
            </motion.p>
          ) : (
            <div className="flex gap-2">
              <input
                value={name}
                onChange={(e) => setTypedName(e.target.value)}
                placeholder="Tu apodo"
                maxLength={16}
                className="field min-w-0 flex-1 py-3"
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
                <Upload size={17} strokeWidth={2.6} />
                Subir
              </button>
            </div>
          )}
          <Leaderboard entries={top} />
          <button type="button" className="btn-accent w-full" onClick={start}>
            <RotateCcw size={18} strokeWidth={2.6} />
            Otra vuelta
          </button>
        </motion.section>
      </Shell>
    );
  }

  return (
    <Shell style={accent}>
      <section className="card space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="eyebrow">
            Tema {index + 1} / {TOTAL_ROUNDS}
          </span>
          <span className="pill">
            <AnimatedNumber value={score} /> aciertos
          </span>
        </div>
        <RoundProgress index={index} total={TOTAL_ROUNDS} />

        <div className="stage">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#3db8ff" />
        </div>

        {round && (
          <OptionGrid
            key={round.roundId}
            options={round.options}
            onPick={pick}
            pickedId={picked}
            correctId={solution?.correctOptionId ?? null}
            locked={Boolean(picked)}
          />
        )}

        <AnimatePresence>
          {solution && (
            <SolutionCard
              title={solution.title}
              artist={solution.artist}
              artwork={solution.artwork}
              year={solution.year}
            />
          )}
        </AnimatePresence>
      </section>
    </Shell>
  );
}
