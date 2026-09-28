"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { Waveform } from "@/components/Waveform";
import { getDaily, guessDaily } from "@/lib/api";
import {
  buildShareGrid,
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

    if (res.done) {
      setFinished(true);
      setWon(res.correct);
      setSolution(res.solution);
      saveDailyResult({ date: daily.date, attempts: nextAttempts, won: res.correct, finished: true });
      setStreak(registerDailyWin(daily.date, res.correct).streak);
    } else {
      saveDailyResult({ date: daily.date, attempts: nextAttempts, won: false, finished: false });
    }
  }

  async function share() {
    if (!daily) return;
    const text = `${buildShareGrid(
      { date: daily.date, attempts, won, finished: true },
      daily.maxAttempts,
    )}\n${window.location.origin}`;
    if ((await shareText(text)) === "failed") return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  if (error) {
    return (
      <Shell>
        <p className="card p-6 text-white/70">{error}</p>
      </Shell>
    );
  }

  return (
    <Shell>
      <div className="flex items-center justify-between text-sm text-white/55">
        <span>Desafío del {daily?.date ?? "…"}</span>
        <span className="rounded-full bg-fuchsia-500/15 px-3 py-1 text-fuchsia-200">
          🔥 Racha {streak}
        </span>
      </div>

      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
          <span>Intento {Math.min(attemptIndex + 1, daily?.maxAttempts ?? 6)} / {daily?.maxAttempts ?? 6}</span>
          <span>{finished ? "Ronda cerrada" : `Escuchás ${(unlockedMs / 1000).toFixed(1)}s`}</span>
        </div>

        <div className="relative overflow-hidden rounded-2xl bg-black/30 p-2">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} />
          <div className="mt-1 h-1.5 w-full overflow-hidden rounded-full bg-white/10">
            <motion.div
              className="h-full bg-fuchsia-400"
              animate={{
                width: `${status === "playing" && clipMs ? Math.min(100, (elapsedMs / clipMs) * 100) : 0}%`,
              }}
              transition={{ ease: "linear", duration: 0.05 }}
            />
          </div>
        </div>

        <div className="flex flex-wrap gap-3">
          <button
            type="button"
            className="btn-primary flex-1"
            disabled={status === "loading" || status === "error"}
            onClick={() =>
              status === "playing" ? stop() : playClip(finished ? null : unlockedMs)
            }
          >
            {status === "loading"
              ? "Cargando…"
              : status === "playing"
                ? "⏹ Detener"
                : finished
                  ? "▶ Escuchar completa"
                  : `▶ Escuchar ${(unlockedMs / 1000).toFixed(1)}s`}
          </button>
          {!finished && (
            <button type="button" className="btn-ghost" onClick={() => submit("", true)}>
              Saltear (+tiempo)
            </button>
          )}
        </div>

        <div className="flex gap-1.5">
          {Array.from({ length: daily?.maxAttempts ?? 6 }).map((_, i) => {
            const attempt = attempts[i];
            const tone =
              attempt === "win"
                ? "bg-lime-400"
                : attempt === "fail"
                  ? "bg-rose-400"
                  : attempt === "skip"
                    ? "bg-white/40"
                    : "bg-white/10";
            return <div key={i} className={`h-2 flex-1 rounded-full ${tone}`} />;
          })}
        </div>
      </section>

      {!finished && (
        <section className="relative">
          <input
            ref={inputRef}
            value={guess}
            onChange={(e) => setGuess(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && guess.trim() && submit(guess)}
            placeholder="Escribí el título de la canción…"
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-4 outline-none placeholder:text-white/30 focus:border-fuchsia-400/60"
          />
          <AnimatePresence>
            {suggestions.length > 0 && (
              <motion.ul
                initial={{ opacity: 0, y: -6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0 }}
                className="absolute z-10 mt-2 w-full overflow-hidden rounded-2xl border border-white/12 bg-[#120f22]/95 backdrop-blur"
              >
                {suggestions.map((s) => (
                  <li key={s}>
                    <button
                      type="button"
                      className="w-full px-4 py-3 text-left text-sm hover:bg-white/10"
                      onClick={() => submit(s)}
                    >
                      {s}
                    </button>
                  </li>
                ))}
              </motion.ul>
            )}
          </AnimatePresence>
          <button
            type="button"
            className="btn-ghost mt-3 w-full"
            disabled={!guess.trim()}
            onClick={() => submit(guess)}
          >
            Adivinar
          </button>
        </section>
      )}

      {finished && (
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          className="card space-y-4 p-5 text-center"
        >
          <p className="text-2xl font-black">
            {won ? "🟩 ¡La sacaste!" : "🟥 Se escapó por hoy"}
          </p>
          {solution && (
            <div className="flex items-center justify-center gap-3">
              {solution.artwork && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={solution.artwork} alt="" className="h-16 w-16 rounded-xl" />
              )}
              <div className="text-left">
                <p className="font-bold">{solution.title}</p>
                <p className="text-sm text-white/60">{solution.artist}</p>
              </div>
            </div>
          )}
          <pre className="whitespace-pre-wrap text-xl tracking-[0.3em]">
            {buildShareGrid({ date: daily!.date, attempts, won, finished: true }, daily!.maxAttempts)
              .split("\n")[1]}
          </pre>
          <button type="button" className="btn-primary w-full" onClick={share}>
            {copied ? "¡Copiado!" : "Compartir resultado"}
          </button>
          <p className="text-sm text-white/45">Próximo desafío en {formatCountdown(countdown)}</p>
        </motion.section>
      )}
    </Shell>
  );
}
