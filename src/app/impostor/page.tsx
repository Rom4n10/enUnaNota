"use client";

import { AnimatePresence, motion } from "motion/react";
import { LoaderCircle, Play, RotateCcw, Repeat2, VenetianMask } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ModeHeader } from "@/components/ModeHeader";
import { RoundProgress } from "@/components/RoundProgress";
import { Shell } from "@/components/Shell";
import { Waveform } from "@/components/Waveform";
import { celebrate, fail } from "@/lib/fx";
import { accentStyle, modeOf } from "@/lib/modes";
import { getCategories, getImpostorRound, guessImpostor } from "@/lib/api";
import type { Category, ImpostorResult, ImpostorRound } from "@/lib/types";
import { preloadPreview, usePreviewPlayer } from "@/lib/useAudio";

const CLIP_MS = 1_500;
const GAP_MS = 400;
const TOTAL_ROUNDS = 8;

type Phase = "setup" | "loading" | "playing" | "over";

export default function ImpostorPage() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("pop-global");
  const [phase, setPhase] = useState<Phase>("setup");
  const [group, setGroup] = useState<ImpostorRound | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [playToken, setPlayToken] = useState(0);
  const [picked, setPicked] = useState<string | null>(null);
  const [result, setResult] = useState<ImpostorResult | null>(null);
  const [index, setIndex] = useState(0);
  const [score, setScore] = useState(0);
  const chain = useRef<ReturnType<typeof setTimeout>[]>([]);
  const handledToken = useRef(0);

  const activeUrl = group?.clips.find((c) => c.clipId === active)?.audioUrl ?? null;
  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(activeUrl);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => () => chain.current.forEach(clearTimeout), []);

  // Waits for the clip to be decoded before firing, without re-rendering on its own.
  useEffect(() => {
    if (!playToken || playToken === handledToken.current || status !== "ready") return;
    handledToken.current = playToken;
    playClip(CLIP_MS);
  }, [playToken, status, playClip]);

  const play = useCallback((clipId: string) => {
    setActive(clipId);
    setPlayToken((t) => t + 1);
  }, []);

  const playAll = useCallback(
    (clips: { clipId: string }[]) => {
      chain.current.forEach(clearTimeout);
      chain.current = clips.map((clip, i) =>
        setTimeout(() => play(clip.clipId), i * (CLIP_MS + GAP_MS)),
      );
    },
    [play],
  );

  const load = useCallback(async () => {
    const payload = await getImpostorRound(categoryId);
    payload.clips.forEach((c) => preloadPreview(c.audioUrl));
    setGroup(payload);
    setPicked(null);
    setResult(null);
    setTimeout(() => playAll(payload.clips), 600);
  }, [categoryId, playAll]);

  async function start() {
    setPhase("loading");
    setIndex(0);
    setScore(0);
    try {
      await load();
      setPhase("playing");
    } catch {
      setPhase("setup");
    }
  }

  async function pick(clipId: string) {
    if (!group || picked) return;
    chain.current.forEach(clearTimeout);
    stop();
    setPicked(clipId);
    const res = await guessImpostor(group.groupId, clipId);
    setResult(res);
    if (res.correct) celebrate();
    else fail();
    if (res.correct) setScore((s) => s + 1);
    setTimeout(async () => {
      if (index + 1 >= TOTAL_ROUNDS) {
        setPhase("over");
        return;
      }
      setIndex((i) => i + 1);
      try {
        await load();
      } catch {
        setPhase("over");
      }
    }, 3000);
  }

  const accent = accentStyle(modeOf("impostor").color);

  if (phase === "setup" || phase === "loading") {
    return (
      <Shell style={accent}>
        <ModeHeader id="impostor">
          Tres fragmentos de 1,5 segundos: dos son del mismo artista y uno se coló de otro. Encontrá al impostor.
        </ModeHeader>
        <section className="card space-y-5 p-5 sm:p-6">
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} />
          <button type="button" className="btn-accent w-full text-lg" onClick={start} disabled={phase === "loading"}>
            {phase === "loading" && <LoaderCircle size={18} className="animate-spin" />}
            {phase === "loading" ? "Buscando sospechosos…" : "Arrancar"}
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
          <p className="eyebrow">Caso cerrado</p>
          <p className="font-display text-7xl font-extrabold text-accent">
            <AnimatedNumber value={score} />
            <span className="text-3xl text-white/40">/{TOTAL_ROUNDS}</span>
          </p>
          <button type="button" className="btn-accent w-full" onClick={start}>
            <RotateCcw size={18} strokeWidth={2.6} />
            Otra ronda
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
            Caso {index + 1} / {TOTAL_ROUNDS}
          </span>
          <span className="pill">
            <AnimatedNumber value={score} /> resueltos
          </span>
        </div>
        <RoundProgress index={index} total={TOTAL_ROUNDS} />

        <p className="font-display text-lg font-bold leading-snug">
          Dos fragmentos son de <span className="text-accent">{group?.artist}</span>. ¿Cuál no?
        </p>

        <div className="stage">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#ff5e5b" />
        </div>

        <div className="grid gap-2.5 sm:grid-cols-3">
          {group?.clips.map((clip, i) => {
            const reveal = result?.clips.find((c) => c.clipId === clip.clipId);
            const isActive = active === clip.clipId && status === "playing";
            const mine = picked === clip.clipId;
            const tone = !reveal
              ? isActive
                ? "border-accent bg-accent/10"
                : mine
                  ? "border-accent/70 bg-white/[0.06]"
                  : "border-white/10 bg-surface-2"
              : reveal.impostor
                ? "border-lime bg-lime/10"
                : mine
                  ? "border-coral/70 bg-coral/10"
                  : "border-white/10 bg-surface-2 opacity-60";
            return (
              <motion.div
                key={clip.clipId}
                initial={{ opacity: 0, y: 16 }}
                animate={
                  reveal && mine && !reveal.impostor
                    ? { opacity: 1, y: 0, x: [0, -8, 8, -5, 5, 0] }
                    : reveal?.impostor
                      ? { opacity: 1, y: 0, scale: [1, 1.05, 1] }
                      : { opacity: 1, y: 0, scale: isActive ? 1.02 : 1 }
                }
                transition={{ delay: reveal ? 0 : i * 0.06, duration: 0.4 }}
                className={`space-y-2.5 rounded-2xl border p-3 shadow-[0_4px_0_rgba(0,0,0,0.5)] transition-colors ${tone}`}
              >
                <div className="flex items-center gap-2">
                  <motion.button
                    type="button"
                    whileTap={{ scale: 0.9 }}
                    className="relative grid h-11 w-11 shrink-0 place-items-center rounded-full bg-accent text-ink"
                    onClick={() => play(clip.clipId)}
                    aria-label={`Escuchar fragmento ${i + 1}`}
                  >
                    {isActive && (
                      <span className="absolute inset-0 rounded-full bg-accent" style={{ animation: "ring 1.1s ease-out infinite" }} />
                    )}
                    <Play size={16} fill="currentColor" className="relative translate-x-px" />
                  </motion.button>
                  <span className="font-display text-2xl font-extrabold text-white/80">#{i + 1}</span>
                </div>
                <motion.button
                  type="button"
                  whileTap={picked ? undefined : { scale: 0.95 }}
                  className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/10 px-3 py-2.5 text-sm font-extrabold transition hover:bg-accent hover:text-ink disabled:pointer-events-none disabled:opacity-70"
                  disabled={Boolean(picked)}
                  onClick={() => pick(clip.clipId)}
                >
                  <VenetianMask size={16} strokeWidth={2.4} />
                  {mine ? "Tu elección" : "Es el impostor"}
                </motion.button>
                <AnimatePresence>
                  {reveal && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0 }}
                      className="flex items-center gap-2 overflow-hidden"
                    >
                      {reveal.artwork && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={reveal.artwork} alt="" className="h-10 w-10 rounded-lg" />
                      )}
                      <div className="min-w-0 text-xs">
                        <p className="truncate font-bold">{reveal.title}</p>
                        <p className="truncate text-white/60">{reveal.artist}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            );
          })}
        </div>

        <button type="button" className="btn-ghost w-full" onClick={() => group && playAll(group.clips)}>
          <Repeat2 size={18} strokeWidth={2.4} />
          Escuchar los tres
        </button>
      </section>
    </Shell>
  );
}
