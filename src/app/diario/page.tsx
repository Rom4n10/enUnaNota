"use client";

import { AnimatePresence, motion } from "motion/react";
import { Check, Flame, Search, Share2, SkipForward, X } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { ListenButton } from "@/components/ListenButton";
import { ModeHeader } from "@/components/ModeHeader";
import { Shell } from "@/components/Shell";
import { Waveform } from "@/components/Waveform";
import { celebrate, fail } from "@/lib/fx";
import { accentStyle, modeOf } from "@/lib/modes";
import { getDaily, guessDaily, logGame } from "@/lib/api";
import {
  buildDailyShareText,
  getDailyResult,
  getProfile,
  registerDailyWin,
  saveDailyResult,
  type DailyResult,
} from "@/lib/storage";
import { shareText } from "@/lib/share";
import type { DailyPayload, Solution } from "@/lib/types";
import { usePreviewPlayer } from "@/lib/useAudio";

function formatCountdown(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = String(Math.floor(total / 3600)).padStart(2, "0");
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, "0");
  const s = String(total % 60).padStart(2, "0");
  return `${h}:${m}:${s}`;
}

export default function DailyPage() {
  const [daily, setDaily] = useState<DailyPayload | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState<DailyResult["attempts"]>([]);
  const [finished, setFinished] = useState(false);
  const [won, setWon] = useState(false);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [guess, setGuess] = useState("");
  const [streak, setStreak] = useState(0);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const { status, playClip, stop, elapsedMs, clipMs, getAnalyser } = usePreviewPlayer(
    daily?.audioUrl ?? null,
  );

  const attemptIndex = attempts.length;
  const unlockedMs = daily ? daily.steps[Math.min(attemptIndex, daily.steps.length - 1)] : 0;

  useEffect(() => {
    getDaily()
      .then((payload) => {
        setDaily(payload);
        setCountdown(payload.nextPuzzleInMs);
        const stored = getDailyResult(payload.date);
        if (stored) {
          setAttempts(stored.attempts);
          setFinished(stored.finished);
          setWon(stored.won);
        }
        setStreak(getProfile().streak);
      })
      .catch(() => setError("No pudimos cargar el desafío de hoy. Probá de nuevo en un rato."));
  }, []);

  useEffect(() => {
    if (!countdown) return;
    const id = setInterval(() => setCountdown((c) => Math.max(0, c - 1000)), 1000);
    return () => clearInterval(id);
  }, [countdown]);

  const suggestions = useMemo(() => {
    if (!daily || guess.trim().length < 2) return [];
    const needle = guess.toLowerCase();
    return daily.choices.filter((c) => c.toLowerCase().includes(needle)).slice(0, 6);
  }, [daily, guess]);

  async function submit(value: string, skipped = false) {
    if (!daily || finished) return;
    const res = await guessDaily({ guess: value, attempt: attemptIndex, skipped });
    const nextAttempts: DailyResult["attempts"] = [
      ...attempts,
      res.correct ? "win" : skipped ? "skip" : "fail",
    ];
    setAttempts(nextAttempts);
    setGuess("");
    stop();
    if (res.correct) celebrate(undefined, true);
    else if (!skipped) fail();

    if (res.done) {
      setFinished(true);
      setWon(res.correct);
      setSolution(res.solution);
      saveDailyResult({ date: daily.date, attempts: nextAttempts, won: res.correct, finished: true });
      setStreak(registerDailyWin(daily.date, res.correct).streak);
      logGame({ mode: "diario", score: res.correct ? nextAttempts.length : 0 }).catch(() => undefined);
    } else {
      saveDailyResult({ date: daily.date, attempts: nextAttempts, won: false, finished: false });
    }
  }

  async function share() {
    if (!daily) return;
    const text = buildDailyShareText(
      { date: daily.date, attempts, won, finished: true },
      daily.steps,
      streak,
      `${window.location.origin}/diario`,
    );
    if ((await shareText(text)) === "failed") return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const accent = accentStyle(modeOf("diario").color);
  const maxAttempts = daily?.maxAttempts ?? 6;

  if (error) {
    return (
      <Shell style={accent}>
        <p className="card p-6 text-white/70">{error}</p>
      </Shell>
    );
  }

  return (
    <Shell style={accent}>
      <div className="flex items-start justify-between gap-3">
        <ModeHeader id="diario">Desafío del {daily?.date ?? "…"}</ModeHeader>
        <motion.span
          key={streak}
          initial={{ scale: 0.6 }}
          animate={{ scale: 1 }}
          transition={{ type: "spring", stiffness: 500, damping: 14 }}
          className="pill shrink-0"
          style={accentStyle("#ff8a1f")}
        >
          <Flame size={15} strokeWidth={2.6} />
          {streak}
        </motion.span>
      </div>

      <section className="card space-y-5 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="eyebrow">
            Intento {Math.min(attemptIndex + 1, maxAttempts)} / {maxAttempts}
          </span>
          <AnimatePresence mode="popLayout">
            <motion.span
              key={finished ? "done" : unlockedMs}
              initial={{ y: -12, opacity: 0 }}
              animate={{ y: 0, opacity: 1 }}
              exit={{ y: 12, opacity: 0 }}
              className="pill"
            >
              {finished ? "Ronda cerrada" : `${(unlockedMs / 1000).toFixed(1)}s`}
            </motion.span>
          </AnimatePresence>
        </div>

        <div className="stage">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} />
          <div className="mx-1 mb-1 mt-1.5 h-1.5 overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full rounded-full bg-accent shadow-[0_0_12px_var(--accent)]"
              animate={{
                width: `${status === "playing" && clipMs ? Math.min(100, (elapsedMs / clipMs) * 100) : 0}%`,
              }}
              transition={{ ease: "linear", duration: 0.05 }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <ListenButton
            status={status}
            className="flex-1"
            label={finished ? "Escuchar completa" : `Escuchar ${(unlockedMs / 1000).toFixed(1)}s`}
            onPlay={() => playClip(finished ? null : unlockedMs)}
            onStop={stop}
          />
          {!finished && (
            <button type="button" className="btn-ghost" onClick={() => submit("", true)}>
              <SkipForward size={18} strokeWidth={2.4} />
              Saltear
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          {Array.from({ length: maxAttempts }).map((_, i) => {
            const attempt = attempts[i];
            const tone =
              attempt === "win"
                ? "bg-lime text-ink"
                : attempt === "fail"
                  ? "bg-coral/80 text-ink"
                  : attempt === "skip"
                    ? "bg-white/25 text-ink"
                    : i === attemptIndex && !finished
                      ? "bg-white/10 ring-2 ring-accent/70"
                      : "bg-white/8";
            return (
              <motion.div
                key={`${i}-${attempt ?? "empty"}`}
                initial={attempt ? { scale: 0.4, rotateX: 90 } : false}
                animate={{ scale: 1, rotateX: 0 }}
                transition={{ type: "spring", stiffness: 420, damping: 18 }}
                className={`grid h-9 flex-1 place-items-center rounded-xl ${tone}`}
              >
                {attempt === "win" && <Check size={18} strokeWidth={3} />}
                {attempt === "fail" && <X size={18} strokeWidth={3} />}
                {attempt === "skip" && <SkipForward size={15} strokeWidth={3} />}
              </motion.div>
            );
          })}
        </div>
      </section>

      {!finished && (
        <section className="relative space-y-3">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              ref={inputRef}
              value={guess}
              onChange={(e) => setGuess(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && guess.trim() && submit(guess)}
              placeholder="Escribí el título de la canción…"
              className="field pl-11"
            />
          </div>
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -6, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -6 }}
                className="absolute top-14 z-10 w-full overflow-hidden rounded-2xl border border-white/10 bg-surface-2/95 shadow-2xl backdrop-blur"
              >
                {suggestions.map((s, i) => (
                  <motion.li
                    key={s}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: 1, x: 0 }}
                    transition={{ delay: i * 0.03 }}
                  >
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm font-semibold transition hover:bg-accent hover:text-ink"
                      onClick={() => submit(s)}
                    >
                      {s}
                    </button>
                  </motion.li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
          <button type="button" className="btn-primary w-full" disabled={!guess.trim()} onClick={() => submit(guess)}>
            Adivinar
          </button>
        </section>
      )}

      {finished && (
        <motion.section
          initial={{ opacity: 0, y: 20, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          transition={{ type: "spring", stiffness: 260, damping: 22 }}
          className="card space-y-5 p-6 text-center"
        >
          <motion.span
            initial={{ scale: 0, rotate: -30 }}
            animate={{ scale: 1, rotate: 0 }}
            transition={{ delay: 0.1, type: "spring", stiffness: 400, damping: 12 }}
            className={`mx-auto grid h-16 w-16 place-items-center rounded-2xl ${won ? "bg-lime text-ink" : "bg-coral/20 text-coral"}`}
          >
            {won ? <Check size={34} strokeWidth={3} /> : <X size={34} strokeWidth={3} />}
          </motion.span>
          <p className="font-display text-3xl font-extrabold">{won ? "¡La sacaste!" : "Se escapó por hoy"}</p>
          {solution && (
            <div className="mx-auto flex max-w-sm items-center gap-3 rounded-2xl bg-white/5 p-3 text-left">
              {solution.artwork && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={solution.artwork} alt="" className="h-16 w-16 rounded-xl" />
              )}
              <div>
                <p className="font-display text-lg font-bold leading-tight">{solution.title}</p>
                <p className="text-sm text-white/60">{solution.artist}</p>
              </div>
            </div>
          )}
          <div className="flex justify-center gap-1.5">
            {Array.from({ length: maxAttempts }).map((_, i) => {
              const attempt = attempts[i];
              const tone =
                attempt === "win" ? "bg-lime" : attempt === "fail" ? "bg-coral" : attempt === "skip" ? "bg-white/30" : "bg-white/10";
              return (
                <motion.span
                  key={i}
                  initial={{ scale: 0, y: 10 }}
                  animate={{ scale: 1, y: 0 }}
                  transition={{ delay: 0.25 + i * 0.07, type: "spring", stiffness: 500, damping: 15 }}
                  className={`h-8 w-8 rounded-lg ${tone}`}
                />
              );
            })}
          </div>
          <button type="button" className="btn-primary w-full" onClick={share}>
            <Share2 size={18} strokeWidth={2.6} />
            {copied ? "¡Copiado!" : "Compartir resultado"}
          </button>
          <p className="text-sm text-white/45">
            Próximo desafío en <span className="font-bold tabular-nums text-white/80">{formatCountdown(countdown)}</span>
          </p>
        </motion.section>
      )}
    </Shell>
  );
}
