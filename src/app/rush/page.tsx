"use client";

import { AnimatePresence, motion } from "motion/react";
import { Flame, LoaderCircle, RotateCcw, Zap } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Leaderboard } from "@/components/Leaderboard";
import { ModeHeader } from "@/components/ModeHeader";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { ScoreSubmit } from "@/components/ScoreSubmit";
import { Waveform } from "@/components/Waveform";
import { celebrate } from "@/lib/fx";
import { accentStyle, modeOf } from "@/lib/modes";
import { answerRound, getCategories, getLeaderboard, getRound, submitScore } from "@/lib/api";
import { updateProfile } from "@/lib/storage";
import type { Category, RoundPayload, ScoreEntry } from "@/lib/types";
import { preloadPreview, useAutoplay, usePreviewPlayer } from "@/lib/useAudio";
import { useGameLog } from "@/lib/useGameLog";
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
  const prefetched = useRef<Promise<RoundPayload> | null>(null);
  const [top, setTop] = useState<ScoreEntry[]>([]);

  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);
  const profile = useProfile();
  const best = profile.rushBest;
  useGameLog(phase === "over", { mode: "rush", categoryId, score });

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

  useAutoplay(status, round?.audioUrl ?? null, phase === "playing", () => playClip(null));

  // The clock only runs while there is something to hear.
  const audioLive = useRef(false);
  useEffect(() => {
    audioLive.current = status === "playing" || status === "ready";
  }, [status]);

  useEffect(() => {
    if (phase !== "playing" || status !== "error") return;
    const id = setTimeout(() => void nextRound(), 300);
    return () => clearTimeout(id);
  }, [phase, status, nextRound]);

  useEffect(() => {
    if (phase !== "playing") return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (!audioLive.current) deadline.current += now - last;
      last = now;
      const left = deadline.current - now;
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
        if (!fever) celebrate(undefined, true);
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
      celebrate();
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

  const accent = accentStyle(modeOf("rush").color);

  if (phase === "setup") {
    return (
      <Shell style={accent}>
        <ModeHeader id="rush">
          45 segundos en el reloj. Cada acierto suma 4 segundos, cada error resta 6 y descarta esa opción. Tres
          aciertos seguidos en menos de 2 segundos activan el modo Fiebre (x2 puntos).
        </ModeHeader>
        <section className="card space-y-5 p-5 sm:p-6">
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          {best > 0 && (
            <p className="pill">
              <Zap size={14} strokeWidth={2.6} />
              Tu récord: {best} puntos
            </p>
          )}
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
          <p className="eyebrow">Se acabó el tiempo</p>
          <AnimatedNumber value={score} className="font-display text-7xl font-extrabold text-accent" />
          <p className="text-white/60">
            {solved} canciones adivinadas · récord {best}
          </p>
          <ScoreSubmit
            submit={(name) => submitScore({ mode: "rush", categoryId, name, score })}
            onResult={(r) => setTop(r.top)}
            resultText={(rank) => (rank ? `Entraste #${rank} en el ranking semanal` : "Esta vez no entraste al top 50")}
          />
          <Leaderboard entries={top} />
          <button type="button" className="btn-accent w-full" onClick={start}>
            <RotateCcw size={18} strokeWidth={2.6} />
            Revancha
          </button>
        </motion.section>
      </Shell>
    );
  }

  const urgency = timeLeft < 10_000;
  const timePct = Math.min(100, (timeLeft / START_MS) * 100);

  return (
    <Shell style={fever ? accentStyle("#ffd23f") : accent}>
      <motion.section
        animate={fever ? { boxShadow: ["0 0 0px 0px rgba(255,210,63,0)", "0 0 50px 4px rgba(255,210,63,0.35)", "0 0 0px 0px rgba(255,210,63,0)"] } : { boxShadow: "0 0 0px 0px rgba(0,0,0,0)" }}
        transition={fever ? { repeat: Infinity, duration: 1.2 } : { duration: 0.3 }}
        className={`card space-y-4 p-5 sm:p-6 ${fever ? "border-yellow/60" : ""}`}
      >
        <div className="flex items-end justify-between">
          <motion.span
            key={urgency ? "urgent" : "calm"}
            animate={urgency ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ repeat: urgency ? Infinity : 0, duration: 0.7 }}
            className={`font-display text-5xl font-extrabold tabular-nums ${urgency ? "text-coral" : ""}`}
          >
            {(timeLeft / 1000).toFixed(1)}
            <span className="text-2xl text-white/40">s</span>
          </motion.span>
          <div className="text-right">
            <AnimatedNumber value={score} className="font-display text-3xl font-extrabold" />
            <AnimatePresence mode="popLayout">
              <motion.p
                key={fever ? "fever" : `combo-${combo}`}
                initial={{ y: 10, opacity: 0, scale: 0.8 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ y: -10, opacity: 0 }}
                transition={{ type: "spring", stiffness: 500, damping: 20 }}
                className={`flex items-center justify-end gap-1 text-xs font-extrabold uppercase tracking-widest ${
                  fever ? "text-yellow" : combo > 0 ? "text-accent" : "text-white/40"
                }`}
              >
                {fever ? (
                  <>
                    <Flame size={14} strokeWidth={2.8} /> Fiebre x2
                  </>
                ) : (
                  <>
                    <Zap size={13} strokeWidth={2.8} /> Combo {combo}
                  </>
                )}
              </motion.p>
            </AnimatePresence>
          </div>
        </div>

        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className={`h-full rounded-full ${urgency ? "bg-coral" : "bg-accent"}`}
            animate={{ width: `${timePct}%` }}
            transition={{ ease: "linear", duration: 0.1 }}
          />
        </div>

        <div className="stage relative">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color={fever ? "#ffd23f" : "#ff8a1f"} />
          <AnimatePresence>
            {flash && (
              <motion.p
                initial={{ opacity: 0, y: 14, scale: 0.8 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -14 }}
                transition={{ type: "spring", stiffness: 500, damping: 22 }}
                className={`absolute inset-x-2 top-1/2 -translate-y-1/2 truncate rounded-xl px-3 py-2 text-center font-display text-lg font-extrabold shadow-xl ${
                  flash.good ? "bg-lime text-ink" : "bg-coral text-ink"
                }`}
              >
                {flash.text}
              </motion.p>
            )}
          </AnimatePresence>
        </div>
        {(status === "loading" || status === "error") && (
          <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-white/45">
            <LoaderCircle size={14} className="animate-spin" />
            Cargando audio · reloj en pausa
          </p>
        )}

        {round && <OptionGrid key={round.roundId} options={round.options} onPick={pick} disabledIds={discarded} />}
      </motion.section>
    </Shell>
  );
}
