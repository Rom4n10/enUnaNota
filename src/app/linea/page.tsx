"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { Waveform } from "@/components/Waveform";
import { getCategories, getTimelineRound, guessTimeline } from "@/lib/api";
import type { Category, RoundPayload, Solution } from "@/lib/types";
import { preloadPreview, useAutoplay, usePreviewPlayer } from "@/lib/useAudio";

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

  if (phase === "setup" || phase === "loading") {
    return (
      <Shell>
        <section className="card space-y-4 p-5">
          <h1 className="text-2xl font-black">🕰️ Time Machine</h1>
          <p className="text-sm text-white/60">
            Escuchás 2,5 segundos de un tema desconocido y lo ubicás en tu línea de tiempo. Cada
            acierto suma una canción a la línea y los huecos se vuelven más finitos.
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
          <button
            type="button"
            className="btn-primary w-full"
            onClick={start}
            disabled={phase === "loading"}
          >
            {phase === "loading" ? "Armando la línea…" : "Arrancar"}
          </button>
        </section>
      </Shell>
    );
  }

  if (phase === "over") {
    return (
      <Shell>
        <section className="card space-y-4 p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">Se cortó la línea</p>
          <p className="text-5xl font-black text-indigo-300">{score}</p>
          <p className="text-sm text-white/60">canciones bien ubicadas</p>
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
          <span>{score} ubicadas</span>
          <span>{"❤️".repeat(Math.max(0, lives))}</span>
        </div>

        <div className="rounded-2xl bg-black/30 p-2">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#818cf8" />
        </div>

        <button type="button" className="btn-ghost w-full" onClick={() => playClip(CLIP_MS)}>
          🔁 Escuchar de nuevo
        </button>

        <div className="flex gap-1 overflow-x-auto pb-1">
          {anchors.map((a) => (
            <div
              key={`${a.title}-${a.year}`}
              className="min-w-24 shrink-0 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-center"
            >
              <p className="text-sm font-black tabular-nums text-indigo-300">{a.year}</p>
              <p className="truncate text-[11px] text-white/50">{a.title}</p>
            </div>
          ))}
        </div>

        <div className="grid gap-2">
          {slotsOf(anchors).map((slot) => (
            <button
              key={slot.label}
              type="button"
              disabled={Boolean(solution)}
              onClick={() => pick(slot.after, slot.before)}
              className="rounded-2xl border border-white/12 bg-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/10 disabled:opacity-50"
            >
              {slot.label}
            </button>
          ))}
        </div>

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
                  {lastOk ? "✅" : "❌"} {solution.title}{" "}
                  {solution.year ? `(${solution.year})` : ""}
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
