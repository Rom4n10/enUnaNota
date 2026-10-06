"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useCallback, useEffect, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { Waveform } from "@/components/Waveform";
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

  if (phase === "setup" || phase === "loading") {
    return (
      <Shell>
        <section className="card space-y-4 p-5">
          <h1 className="text-2xl font-black">🔗 Cadena de Feats</h1>
          <p className="text-sm text-white/60">
            Suena una colaboración: acertá el tema y la cadena sigue con el artista invitado.
            Dos minutos para armar la cadena más larga.
          </p>
          <input
            value={seed}
            onChange={(e) => setSeed(e.target.value)}
            placeholder="Artista inicial"
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-3 outline-none placeholder:text-white/30 focus:border-fuchsia-400/60"
          />
          <div className="flex flex-wrap gap-2">
            {SEEDS.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSeed(s)}
                className="rounded-full border border-white/12 bg-white/5 px-3 py-1.5 text-sm hover:bg-white/10"
              >
                {s}
              </button>
            ))}
          </div>
          <button
            type="button"
            className="btn-primary w-full"
            onClick={start}
            disabled={phase === "loading"}
          >
            {phase === "loading" ? "Buscando el primer feat…" : "Arrancar"}
          </button>
        </section>
      </Shell>
    );
  }

  if (phase === "over") {
    return (
      <Shell>
        <section className="card space-y-4 p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">{endReason}</p>
          <p className="text-5xl font-black text-emerald-300">{Math.max(0, links.length - 1)}</p>
          <p className="text-sm text-white/60">eslabones encadenados</p>
          <p className="text-sm text-white/70">{links.join(" → ")}</p>
          <button type="button" className="btn-primary w-full" onClick={start}>
            Otra cadena
          </button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
          <span>{Math.max(0, links.length - 1)} eslabones</span>
          <span className="tabular-nums">{(msLeft / 1000).toFixed(1)}s</span>
        </div>

        <p className="text-sm text-white/70">
          ¿Qué tema comparte <span className="font-bold text-emerald-300">{from}</span> con otro
          artista?
        </p>

        <div className="rounded-2xl bg-black/30 p-2">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#34d399" />
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

        <p className="truncate text-xs text-white/40">{links.join(" → ")}</p>

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
                <p className="font-bold">{solution.title}</p>
                <p className="text-white/60">{solution.artist}</p>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </Shell>
  );
}
