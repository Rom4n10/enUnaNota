"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { Waveform } from "@/components/Waveform";
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

  if (phase === "setup" || phase === "loading") {
    return (
      <Shell>
        <section className="card space-y-4 p-5">
          <h1 className="text-2xl font-black">🕵️ El Impostor</h1>
          <p className="text-sm text-white/60">
            Tres fragmentos de 1,5 segundos: dos son del mismo artista y uno se coló de otro.
            Encontrá al impostor.
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
            {phase === "loading" ? "Buscando sospechosos…" : "Arrancar"}
          </button>
        </section>
      </Shell>
    );
  }

  if (phase === "over") {
    return (
      <Shell>
        <section className="card space-y-4 p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">Caso cerrado</p>
          <p className="text-5xl font-black text-amber-300">
            {score}/{TOTAL_ROUNDS}
          </p>
          <button type="button" className="btn-primary w-full" onClick={start}>
            Otra ronda
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
            Caso {index + 1} / {TOTAL_ROUNDS}
          </span>
          <span className="tabular-nums">{score} resueltos</span>
        </div>

        <p className="text-sm text-white/70">
          Dos fragmentos son de <span className="font-bold text-amber-300">{group?.artist}</span>.
          ¿Cuál no?
        </p>

        <div className="rounded-2xl bg-black/30 p-2">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#fbbf24" />
        </div>

        <div className="grid gap-2">
          {group?.clips.map((clip, i) => {
            const reveal = result?.clips.find((c) => c.clipId === clip.clipId);
            const tone = !reveal
              ? "border-white/12 bg-white/5 hover:bg-white/10"
              : reveal.impostor
                ? "border-lime-400/70 bg-lime-500/15"
                : "border-white/12 bg-white/5 opacity-70";
            return (
              <div key={clip.clipId} className={`rounded-2xl border p-3 transition ${tone}`}>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className="btn-ghost shrink-0"
                    onClick={() => play(clip.clipId)}
                  >
                    ▶ {i + 1}
                  </button>
                  <button
                    type="button"
                    className="flex-1 rounded-xl bg-white/10 px-3 py-2 text-sm font-semibold transition hover:bg-white/20 disabled:opacity-60"
                    disabled={Boolean(picked)}
                    onClick={() => pick(clip.clipId)}
                  >
                    {picked === clip.clipId ? "Tu elección" : "Es el impostor"}
                  </button>
                </div>
                <AnimatePresence>
                  {reveal && (
                    <motion.div
                      initial={{ opacity: 0, height: 0 }}
                      animate={{ opacity: 1, height: "auto" }}
                      exit={{ opacity: 0 }}
                      className="mt-2 flex items-center gap-2"
                    >
                      {reveal.artwork && (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img src={reveal.artwork} alt="" className="h-10 w-10 rounded-lg" />
                      )}
                      <div className="text-xs">
                        <p className="font-bold">{reveal.title}</p>
                        <p className="text-white/60">{reveal.artist}</p>
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </div>
            );
          })}
        </div>

        <button
          type="button"
          className="btn-ghost w-full"
          onClick={() => group && playAll(group.clips)}
        >
          🔁 Escuchar los tres
        </button>
      </section>
    </Shell>
  );
}
