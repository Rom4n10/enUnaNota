"use client";

import { AnimatePresence, motion } from "motion/react";
import { ChevronRight, Link2, LoaderCircle, RotateCcw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ModeHeader } from "@/components/ModeHeader";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { SolutionCard } from "@/components/SolutionCard";
import { Waveform } from "@/components/Waveform";
import { accentStyle, modeOf } from "@/lib/modes";
import { getChainRound, guessChain } from "@/lib/api";
import type { ChainRound, Solution } from "@/lib/types";
import { preloadPreview, useAutoplay, usePreviewPlayer } from "@/lib/useAudio";

const CLIP_MS = 6_000;
const TOTAL_MS = 120_000;
const SEEDS = ["Bizarrap", "Duki", "Bad Bunny", "Tini", "Emilia", "Drake"];

type Phase = "setup" | "loading" | "playing" | "over";

export default function ChainPage() {
  const [seed, setSeed] = useState("Bizarrap");
  const [phase, setPhase] = useState<Phase>("setup");
  const [round, setRound] = useState<ChainRound | null>(null);
  const [from, setFrom] = useState("");
  const [links, setLinks] = useState<string[]>([]);
  const [picked, setPicked] = useState<string | null>(null);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [endReason, setEndReason] = useState("");
  const [msLeft, setMsLeft] = useState(TOTAL_MS);
  const deadline = useRef(0);
  const used = useRef<number[]>([]);

  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);
  const audioLive = useRef(false);

  useEffect(() => {
    audioLive.current = status === "playing" || status === "ready";
  }, [status]);

  useEffect(() => {
    if (phase !== "playing") return;
    let last = Date.now();
    const id = setInterval(() => {
      const now = Date.now();
      if (!audioLive.current) deadline.current += now - last;
      last = now;
      const left = deadline.current - now;
      setMsLeft(Math.max(0, left));
      if (left <= 0) {
        setEndReason("Se acabó el tiempo");
        setPhase("over");
      }
    }, 200);
    return () => clearInterval(id);
  }, [phase]);

  useAutoplay(status, round?.audioUrl ?? null, phase === "playing" && !solution, () =>
    playClip(CLIP_MS),
  );

  const load = useCallback(async (artist: string) => {
    const payload = await getChainRound(artist, used.current.slice(-40));
    if (payload.trackId) used.current.push(payload.trackId);
    preloadPreview(payload.audioUrl);
    setRound(payload);
    setFrom(payload.from);
    setPicked(null);
    setSolution(null);
  }, []);

  // A preview that never loads gets swapped for another collab of the same artist.
  useEffect(() => {
    if (phase !== "playing" || status !== "error" || solution || !from) return;
    const id = setTimeout(() => void load(from).catch(() => {}), 300);
    return () => clearTimeout(id);
  }, [phase, status, solution, from, load]);

  async function start() {
    const artist = seed.trim();
    if (!artist) return;
    setPhase("loading");
    used.current = [];
    setLinks([artist]);
    setMsLeft(TOTAL_MS);
    try {
      await load(artist);
      deadline.current = Date.now() + TOTAL_MS;
      setPhase("playing");
    } catch {
      setEndReason(`No encontramos colaboraciones de ${artist}`);
      setPhase("over");
    }
  }

  async function pick(optionId: string) {
    if (!round || picked) return;
    setPicked(optionId);
    stop();
    const res = await guessChain(round.roundId, optionId);
    setSolution(res.solution);
    if (!res.correct) {
      setTimeout(() => {
        setEndReason("Cortaste la cadena");
        setPhase("over");
      }, 2200);
      return;
    }
    const next = res.nextArtist;
    setTimeout(async () => {
      if (!next) {
        setEndReason("La cadena llegó a un callejón sin salida");
        setPhase("over");
        return;
      }
      setLinks((l) => [...l, next]);
      try {
        await load(next);
      } catch {
        setEndReason(`No hay más colaboraciones de ${next}`);
        setPhase("over");
      }
    }, 2200);
  }

  const accent = accentStyle(modeOf("cadena").color);
  const chainView = (
    <div className="flex flex-wrap items-center gap-1">
      <AnimatePresence initial={false}>
        {links.map((artist, i) => (
          <motion.span
            key={`${artist}-${i}`}
            layout
            initial={{ opacity: 0, scale: 0.4, x: -10 }}
            animate={{ opacity: 1, scale: 1, x: 0 }}
            transition={{ type: "spring", stiffness: 500, damping: 22 }}
            className="flex items-center gap-1"
          >
            {i > 0 && <ChevronRight size={14} className="text-accent/70" />}
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-extrabold ${
                i === links.length - 1 ? "bg-accent text-ink" : "bg-white/8 text-white/70"
              }`}
            >
              {artist}
            </span>
          </motion.span>
        ))}
      </AnimatePresence>
    </div>
  );

  if (phase === "setup" || phase === "loading") {
    return (
      <Shell style={accent}>
        <ModeHeader id="cadena">
          Suena una colaboración: acertá el tema y la cadena sigue con el artista invitado. Dos minutos para armar la
          cadena más larga.
        </ModeHeader>
        <section className="card space-y-4 p-5 sm:p-6">
          <div className="relative">
            <Link2 size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
            <input value={seed} onChange={(e) => setSeed(e.target.value)} placeholder="Artista inicial" className="field pl-11" />
          </div>
          <div className="flex flex-wrap gap-2">
            {SEEDS.map((s) => (
              <button key={s} type="button" data-active={s === seed} onClick={() => setSeed(s)} className="chip">
                {s === seed && <span className="absolute inset-0 rounded-full bg-accent" />}
                <span className="relative">{s}</span>
              </button>
            ))}
          </div>
          <button type="button" className="btn-accent w-full text-lg" onClick={start} disabled={phase === "loading"}>
            {phase === "loading" && <LoaderCircle size={18} className="animate-spin" />}
            {phase === "loading" ? "Buscando el primer feat…" : "Arrancar"}
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
          <p className="eyebrow">{endReason}</p>
          <AnimatedNumber value={Math.max(0, links.length - 1)} className="font-display text-7xl font-extrabold text-accent" />
          <p className="text-sm text-white/60">eslabones encadenados</p>
          <div className="flex justify-center">{chainView}</div>
          <button type="button" className="btn-accent w-full" onClick={start}>
            <RotateCcw size={18} strokeWidth={2.6} />
            Otra cadena
          </button>
        </motion.section>
      </Shell>
    );
  }

  const urgency = msLeft < 15_000;

  return (
    <Shell style={accent}>
      <section className="card space-y-4 p-5 sm:p-6">
        <div className="flex items-end justify-between">
          <span className="pill">
            <Link2 size={14} strokeWidth={2.6} />
            <AnimatedNumber value={Math.max(0, links.length - 1)} /> eslabones
          </span>
          <motion.span
            key={urgency ? "urgent" : "calm"}
            animate={urgency ? { scale: [1, 1.08, 1] } : { scale: 1 }}
            transition={{ repeat: urgency ? Infinity : 0, duration: 0.7 }}
            className={`font-display text-3xl font-extrabold tabular-nums ${urgency ? "text-coral" : ""}`}
          >
            {(msLeft / 1000).toFixed(1)}
            <span className="text-lg text-white/40">s</span>
          </motion.span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className={`h-full rounded-full ${urgency ? "bg-coral" : "bg-accent"}`}
            animate={{ width: `${Math.min(100, (msLeft / TOTAL_MS) * 100)}%` }}
            transition={{ ease: "linear", duration: 0.2 }}
          />
        </div>

        <p className="font-display text-lg font-bold leading-snug">
          ¿Qué tema comparte <span className="text-accent">{from}</span> con otro artista?
        </p>

        <div className="stage">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#22e5a0" />
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

        {chainView}

        <AnimatePresence>
          {solution && <SolutionCard title={solution.title} artist={solution.artist} artwork={solution.artwork} />}
        </AnimatePresence>
      </section>
    </Shell>
  );
}
