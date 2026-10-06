"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Award, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ListenButton } from "@/components/ListenButton";
import { ModeHeader } from "@/components/ModeHeader";
import { RoundProgress } from "@/components/RoundProgress";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { SolutionCard } from "@/components/SolutionCard";
import { Waveform } from "@/components/Waveform";
import { celebrate } from "@/lib/fx";
import { accentStyle, modeOf } from "@/lib/modes";
import { answerRound, getArtistRound, suggestArtists } from "@/lib/api";
import { awardBadge } from "@/lib/storage";
import type { RoundPayload, Solution } from "@/lib/types";
import { preloadPreview, useAutoplay, usePreviewPlayer } from "@/lib/useAudio";
import { useGameLog } from "@/lib/useGameLog";

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
  useGameLog(phase === "over", { mode: "artista", categoryId: artist, score: hits });
  const seen = useRef<number[]>([]);
  const prefetched = useRef<Promise<RoundPayload> | null>(null);

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

  useAutoplay(status, round?.audioUrl ?? null, phase === "playing" && !solution, () =>
    playClip(SNIPPET_MS),
  );

  const fetchRound = useCallback((name: string) => {
    const pending = getArtistRound(name, seen.current);
    pending
      .then((payload) => {
        if (payload.trackId) seen.current.push(payload.trackId);
        preloadPreview(payload.audioUrl);
      })
      .catch(() => {});
    return pending;
  }, []);

  const loadRound = useCallback(
    async (name: string) => {
      setSolution(null);
      setPicked(null);
      const payload = await (prefetched.current ?? fetchRound(name));
      prefetched.current = fetchRound(name);
      setRound(payload);
    },
    [fetchRound],
  );

  async function start(name: string) {
    setError(null);
    seen.current = [];
    prefetched.current = null;
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
      if (finalHits >= 5) celebrate(undefined, true);
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

  const accent = accentStyle(modeOf("artista").color);

  if (phase === "setup") {
    return (
      <Shell style={accent}>
        <ModeHeader id="artista">
          10 canciones seguidas escuchando solo el primer segundo. Con 8 aciertos te llevás la insignia de oro.
        </ModeHeader>
        <section className="card space-y-4 p-5 sm:p-6">
          <div className="relative">
            <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && query.trim() && start(query.trim())}
              placeholder="Duki, Charly García, Taylor Swift…"
              className="field pl-11"
            />
          </div>
          <div className="flex flex-wrap gap-2">
            <AnimatePresence>
              {visibleSuggestions.map((name, i) => (
                <motion.button
                  key={name}
                  type="button"
                  initial={{ opacity: 0, scale: 0.8 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0, scale: 0.8 }}
                  transition={{ delay: i * 0.03, type: "spring", stiffness: 500, damping: 24 }}
                  className="chip"
                  onClick={() => start(name)}
                >
                  {name}
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
          {error && <p className="text-sm font-semibold text-coral">{error}</p>}
          <button type="button" className="btn-accent w-full" disabled={!query.trim()} onClick={() => start(query.trim())}>
            Empezar
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
          <p className="eyebrow">{artist}</p>
          <p className="font-display text-7xl font-extrabold text-accent">
            <AnimatedNumber value={hits} />
            <span className="text-3xl text-white/40">/{TOTAL_ROUNDS}</span>
          </p>
          {badge ? (
            <motion.div
              initial={{ scale: 0, rotate: -15 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={{ delay: 0.2, type: "spring", stiffness: 300, damping: 12 }}
              className="mx-auto flex w-fit items-center gap-2 rounded-2xl bg-accent px-4 py-3 font-display font-extrabold text-ink shadow-[0_5px_0_rgba(0,0,0,0.4)]"
            >
              <Award size={22} strokeWidth={2.6} />
              {badge}
            </motion.div>
          ) : (
            <p className="text-white/60">Necesitás 5 aciertos para la primera insignia.</p>
          )}
          <button type="button" className="btn-accent w-full" onClick={() => setPhase("setup")}>
            Otro artista
          </button>
        </motion.section>
      </Shell>
    );
  }

  return (
    <Shell style={accent}>
      <section className="card space-y-4 p-5 sm:p-6">
        <div className="flex items-center justify-between">
          <span className="eyebrow truncate">{artist}</span>
          <span className="pill">
            {index + 1}/{TOTAL_ROUNDS} · <AnimatedNumber value={hits} /> aciertos
          </span>
        </div>
        <RoundProgress index={index} total={TOTAL_ROUNDS} />

        <div className="stage">
          <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#ffd23f" />
        </div>

        <ListenButton
          status={status}
          className="w-full"
          label={solution ? "Escuchar completa" : "Repetir 1 segundo"}
          onPlay={() => playClip(solution ? null : SNIPPET_MS)}
        />

        {round && (
          <OptionGrid
            key={round.roundId}
            options={round.options}
            onPick={pick}
            correctId={solution?.correctOptionId ?? null}
            pickedId={picked}
            locked={Boolean(solution)}
          />
        )}

        <AnimatePresence>
          {solution && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-3">
              <SolutionCard title={solution.title} artist={solution.artist} artwork={solution.artwork} />
              <button type="button" className="btn-accent w-full" onClick={next}>
                {index + 1 >= TOTAL_ROUNDS ? "Ver resultado" : "Siguiente"}
                <ArrowRight size={18} strokeWidth={2.6} />
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </section>
    </Shell>
  );
}
