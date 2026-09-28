"use client";

import { motion } from "framer-motion";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { Waveform } from "@/components/Waveform";
import { answerRound, getArtistRound, suggestArtists } from "@/lib/api";
import { awardBadge } from "@/lib/storage";
import type { RoundPayload, Solution } from "@/lib/types";
import { usePreviewPlayer } from "@/lib/useAudio";

const TOTAL_ROUNDS = 10;
const SNIPPET_MS = 1000;

type Phase = "setup" | "playing" | "over";

export default function ArtistPage() {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [artist, setArtist] = useState("");
  const [phase, setPhase] = useState<Phase>("setup");
  const [round, setRound] = useState<RoundPayload | null>(null);
  const [index, setIndex] = useState(0);
  const [hits, setHits] = useState(0);
  const [solution, setSolution] = useState<Solution | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [badge, setBadge] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const seen = useRef<number[]>([]);

  const { status, playClip, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);

  useEffect(() => {
    if (query.trim().length < 2) return;
    const id = setTimeout(() => {
      suggestArtists(query).then(setSuggestions).catch(() => setSuggestions([]));
    }, 250);
    return () => clearTimeout(id);
  }, [query]);

  const visibleSuggestions = useMemo(
    () => (query.trim().length < 2 ? [] : suggestions),
    [query, suggestions],
  );

  useEffect(() => {
    if (phase === "playing" && status === "ready" && !solution) playClip(SNIPPET_MS);
  }, [phase, status, solution, playClip]);

  const loadRound = useCallback(async (name: string) => {
    setSolution(null);
    setPicked(null);
    const payload = await getArtistRound(name, seen.current);
    if (payload.trackId) seen.current.push(payload.trackId);
    setRound(payload);
  }, []);

  async function start(name: string) {
    setError(null);
    seen.current = [];
    setIndex(0);
    setHits(0);
    setBadge(null);
    try {
      await loadRound(name);
      setArtist(name);
      setPhase("playing");
    } catch {
      setError(`No encontramos suficientes temas de "${name}" con preview.`);
    }
  }

  async function pick(optionId: string) {
    if (!round || solution) return;
    setPicked(optionId);
    const res = await answerRound(round.roundId, optionId);
    setSolution(res.solution);
    if (res.correct) setHits((h) => h + 1);
  }

  async function next() {
    const nextIndex = index + 1;
    const finalHits = hits;
    if (nextIndex >= TOTAL_ROUNDS) {
      setPhase("over");
      if (finalHits >= 8) {
        const earned = `Fan Nivel Oro de ${artist}`;
        awardBadge(earned);
        setBadge(earned);
      } else if (finalHits >= 5) {
        const earned = `Fan Nivel Plata de ${artist}`;
        awardBadge(earned);
        setBadge(earned);
      }
      return;
    }
    setIndex(nextIndex);
    await loadRound(artist);
  }

  if (phase === "setup") {
    return (
      <Shell>
        <section className="card space-y-4 p-5">
          <h1 className="text-2xl font-black">🏅 Desafío de Artista</h1>
          <p className="text-sm text-white/60">
            10 canciones seguidas escuchando solo el primer segundo. Con 8 aciertos te llevás la
            insignia de oro.
          </p>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query.trim() && start(query.trim())}
            placeholder="Duki, Charly García, Taylor Swift…"
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-4 outline-none placeholder:text-white/30 focus:border-fuchsia-400/60"
          />
          <div className="flex flex-wrap gap-2">
            {visibleSuggestions.map((name) => (
              <button
                key={name}
                type="button"
                className="rounded-full border border-white/12 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
                onClick={() => start(name)}
              >
                {name}
              </button>
            ))}
          </div>
          {error && <p className="text-sm text-rose-300">{error}</p>}
          <button
            type="button"
            className="btn-primary w-full"
            disabled={!query.trim()}
            onClick={() => start(query.trim())}
          >
            Empezar
          </button>
        </section>
      </Shell>
    );
  }

  if (phase === "over") {
    return (
      <Shell>
        <section className="card space-y-3 p-6 text-center">
          <p className="text-xs uppercase tracking-widest text-white/40">{artist}</p>
          <p className="text-5xl font-black text-emerald-300">{hits}/{TOTAL_ROUNDS}</p>
          {badge ? (
            <p className="text-lg font-bold text-amber-200">🏅 {badge}</p>
          ) : (
            <p className="text-white/60">Necesitás 5 aciertos para la primera insignia.</p>
          )}
          <button type="button" className="btn-primary w-full" onClick={() => setPhase("setup")}>
            Otro artista
          </button>
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="card space-y-4 p-5">
        <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
          <span>{artist}</span>
          <span>
            {index + 1} / {TOTAL_ROUNDS} · {hits} aciertos
          </span>
        </div>

        <div className="rounded-2xl bg-black/30 p-2">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#34d399" />
        </div>

        <button
          type="button"
          className="btn-ghost w-full"
          disabled={status === "loading"}
          onClick={() => playClip(solution ? null : SNIPPET_MS)}
        >
          {status === "loading" ? "Cargando…" : solution ? "▶ Escuchar completa" : "▶ Repetir 1 segundo"}
        </button>

        {round && (
          <OptionGrid
            options={round.options}
            onPick={pick}
            correctId={solution?.correctOptionId ?? null}
            pickedId={picked}
            locked={Boolean(solution)}
          />
        )}

        {solution && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
            <div className="flex items-center gap-3">
              {solution.artwork && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={solution.artwork} alt="" className="h-14 w-14 rounded-xl" />
              )}
              <div>
                <p className="font-bold">{solution.title}</p>
                <p className="text-sm text-white/60">{solution.artist}</p>
              </div>
            </div>
            <button type="button" className="btn-primary w-full" onClick={next}>
              {index + 1 >= TOTAL_ROUNDS ? "Ver resultado" : "Siguiente"}
            </button>
          </motion.div>
        )}
      </section>
    </Shell>
  );
}
