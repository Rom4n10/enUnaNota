"use client";

import { AnimatePresence, motion } from "motion/react";
import { Heart, LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ListenButton } from "@/components/ListenButton";
import { ModeHeader } from "@/components/ModeHeader";
import { Shell } from "@/components/Shell";
import { SolutionCard } from "@/components/SolutionCard";
import { Waveform } from "@/components/Waveform";
import { celebrate, fail } from "@/lib/fx";
import { accentStyle, modeOf } from "@/lib/modes";
import { getCategories, getTimelineRound, guessTimeline } from "@/lib/api";
import type { Category, RoundPayload, Solution } from "@/lib/types";
import { preloadPreview, useAutoplay, usePreviewPlayer } from "@/lib/useAudio";
import { useGameLog } from "@/lib/useGameLog";

const CLIP_MS = 2_500;
const LIVES = 3;

type Anchor = { title: string; artist: string; year: number };
type Phase = "setup" | "loading" | "playing" | "over";

function slotsOf(anchors: Anchor[]) {
  const years = anchors.map((a) => a.year);
  const slots: { label: string; after: number | null; before: number | null }[] = [
    { label: `Antes de ${years[0]}`, after: null, before: years[0] - 1 },
  ];
  for (let i = 0; i < years.length - 1; i += 1) {
    slots.push({ label: `${years[i]} – ${years[i + 1]}`, after: years[i] - 1, before: years[i + 1] });
  }
  slots.push({
    label: `Después de ${years[years.length - 1]}`,
    after: years[years.length - 1],
    before: null,
  });
  return slots;
}

export default function TimelinePage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("pop-global");
  const [phase, setPhase] = useState<Phase>("setup");
  const [anchors, setAnchors] = useState<Anchor[]>([]);
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [lastOk, setLastOk] = useState<boolean | null>(null);
  const [score, setScore] = useState(0);
  const [lives, setLives] = useState(LIVES);
  useGameLog(phase === "over", { mode: "linea", categoryId, score });
  const seen = useRef<number[]>([]);

  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  const fetchRound = useCallback(async () => {
    const payload = await getTimelineRound(categoryId, seen.current.slice(-40));
    if (payload.trackId) seen.current.push(payload.trackId);
    preloadPreview(payload.audioUrl);
    return payload;
  }, [categoryId]);

  useAutoplay(status, round?.audioUrl ?? null, phase === "playing" && !solution, () =>
    playClip(CLIP_MS),
  );

  async function start() {
    setPhase("loading");
    seen.current = [];
    setScore(0);
    setLives(LIVES);
    setSolution(null);
    setLastOk(null);
    try {
      const seeds = await Promise.all([fetchRound(), fetchRound()]);
      const revealed = await Promise.all(seeds.map((s) => guessTimeline(s.roundId, null, null)));
      const base = revealed
        .map((r) => r.solution)
        .filter((s): s is Solution & { year: number } => s.year !== null)
        .map((s) => ({ title: s.title, artist: s.artist, year: s.year }))
        .sort((a, b) => a.year - b.year);
      if (base.length < 2) {
        setPhase("setup");
        return;
      }
      setAnchors(base);
      setRound(await fetchRound());
      setPhase("playing");
    } catch {
      setPhase("setup");
    }
  }

  async function pick(after: number | null, before: number | null) {
    if (!round || solution) return;
    stop();
    const res = await guessTimeline(round.roundId, after, before);
    setSolution(res.solution);
    setLastOk(res.correct);
    if (res.correct) celebrate();
    else fail();
    if (res.correct) {
      setScore((s) => s + 1);
      if (res.solution.year !== null) {
        const year = res.solution.year;
        setAnchors((list) =>
          [...list, { title: res.solution.title, artist: res.solution.artist, year }].sort(
            (a, b) => a.year - b.year,
          ),
        );
      }
    }
    const left = res.correct ? lives : lives - 1;
    if (!res.correct) setLives(left);
    setTimeout(async () => {
      if (left <= 0) {
        setPhase("over");
        setRound(null);
        return;
      }
      setSolution(null);
      setLastOk(null);
      try {
        setRound(await fetchRound());
      } catch {
        setPhase("over");
      }
    }, 2400);
  }

  const accent = accentStyle(modeOf("linea").color);

  if (phase === "setup" || phase === "loading") {
    return (
      <Shell style={accent}>
        <ModeHeader id="linea">
          Escuchás 2,5 segundos de un tema desconocido y lo ubicás en tu línea de tiempo. Cada acierto suma una canción
          a la línea y los huecos se vuelven más finitos.
        </ModeHeader>
        <section className="card space-y-5 p-5 sm:p-6">
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          <button type="button" className="btn-accent w-full text-lg" onClick={start} disabled={phase === "loading"}>
            {phase === "loading" && <LoaderCircle size={18} className="animate-spin" />}
            {phase === "loading" ? "Armando la línea…" : "Arrancar"}
          </button>
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
          className="card space-y-4 p-6 text-center"
        >
          <p className="eyebrow">Se cortó la línea</p>
          <AnimatedNumber value={score} className="font-display text-7xl font-extrabold text-accent" />
          <p className="text-sm text-white/60">canciones bien ubicadas</p>
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
          <span className="pill">
            <AnimatedNumber value={score} /> ubicadas
          </span>
          <div className="flex gap-1">
            {Array.from({ length: LIVES }, (_, i) => (
              <motion.span
                key={i}
                animate={i < lives ? { scale: 1, opacity: 1 } : { scale: [1, 1.5, 0.8], opacity: 0.25 }}
                transition={{ duration: 0.4 }}
                className={i < lives ? "text-coral" : "text-white/40"}
              >
                <Heart size={20} strokeWidth={2.4} fill={i < lives ? "currentColor" : "none"} />
              </motion.span>
            ))}
          </div>
        </div>

        <div className="stage">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#8c6cff" />
        </div>

        <ListenButton status={status} className="w-full" label="Escuchar de nuevo" onPlay={() => playClip(CLIP_MS)} />

        <div className="relative">
          <div className="absolute inset-x-0 top-[22px] h-0.5 bg-gradient-to-r from-transparent via-accent/50 to-transparent" />
          <motion.div layout className="relative flex gap-2 overflow-x-auto pb-2">
            <AnimatePresence initial={false}>
              {anchors.map((a) => (
                <motion.div
                  layout
                  key={`${a.title}-${a.year}`}
                  initial={{ opacity: 0, scale: 0.5, y: -20 }}
                  animate={{ opacity: 1, scale: 1, y: 0 }}
                  transition={{ type: "spring", stiffness: 400, damping: 22 }}
                  className="flex min-w-24 max-w-32 shrink-0 flex-col items-center gap-1.5 text-center"
                >
                  <span className="rounded-xl bg-accent px-2.5 py-1.5 font-display text-sm font-extrabold tabular-nums text-ink shadow-[0_3px_0_rgba(0,0,0,0.4)]">
                    {a.year}
                  </span>
                  <p className="w-full truncate text-[11px] font-semibold text-white/55">{a.title}</p>
                </motion.div>
              ))}
            </AnimatePresence>
          </motion.div>
        </div>

        <div className="grid gap-2">
          {slotsOf(anchors).map((slot, i) => (
            <motion.button
              key={slot.label}
              type="button"
              initial={{ opacity: 0, x: -12 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{ delay: i * 0.04 }}
              whileHover={solution ? undefined : { x: 4 }}
              whileTap={solution ? undefined : { scale: 0.97 }}
              disabled={Boolean(solution)}
              onClick={() => pick(slot.after, slot.before)}
              className="flex items-center justify-between rounded-2xl border border-white/10 bg-surface-2 px-4 py-3.5 text-left font-display font-bold shadow-[0_4px_0_rgba(0,0,0,0.55)] transition-colors hover:border-accent/70 disabled:opacity-50"
            >
              {slot.label}
              <span className="h-2 w-2 rounded-full bg-accent/70" />
            </motion.button>
          ))}
        </div>

        <AnimatePresence>
          {solution && (
            <SolutionCard
              title={solution.title}
              artist={solution.artist}
              artwork={solution.artwork}
              year={solution.year}
              ok={lastOk ?? undefined}
            />
          )}
        </AnimatePresence>
      </section>
    </Shell>
  );
}
