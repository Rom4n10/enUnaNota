"use client";

import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Award, Crown, RotateCcw, Search } from "lucide-react";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { ListenButton } from "@/components/ListenButton";
import { Leaderboard } from "@/components/Leaderboard";
import { ModeHeader } from "@/components/ModeHeader";
import { RoundProgress } from "@/components/RoundProgress";
import { ScoreSubmit } from "@/components/ScoreSubmit";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { SolutionCard } from "@/components/SolutionCard";
import { Waveform } from "@/components/Waveform";
import { celebrate } from "@/lib/fx";
import { accentStyle, modeOf } from "@/lib/modes";
import {
  answerRound,
  getArtistRound,
  getLeaderboard,
  getTopArtists,
  submitScore,
  suggestArtists,
} from "@/lib/api";
import { ARTIST_ROUNDS, artistScore, formatArtistScore } from "@/lib/artistScore";
import { awardBadge } from "@/lib/storage";
import type { ArtistBoard, RoundPayload, ScoreEntry, Solution } from "@/lib/types";
import { preloadPreview, useAutoplay, usePreviewPlayer } from "@/lib/useAudio";
import { useGameLog } from "@/lib/useGameLog";

const TOTAL_ROUNDS = ARTIST_ROUNDS;
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
  const [selected, setSelected] = useState<string | null>(null);
  const [popular, setPopular] = useState<ArtistBoard[]>([]);
  const [fans, setFans] = useState<ScoreEntry[]>([]);
  const [score, setScore] = useState(0);
  const shownAt = useRef(0);
  const answerMs = useRef(0);
  useGameLog(phase === "over", { mode: "artista", categoryId: artist, score: hits });
  const seen = useRef<number[]>([]);
  const prefetched = useRef<Promise<RoundPayload> | null>(null);

  const { status, playClip, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);

  useEffect(() => {
    if (phase !== "setup") return;
    getTopArtists("all")
      .then((artists) => setPopular(artists.slice(0, 8)))
      .catch(() => setPopular([]));
  }, [phase]);

  const board = phase === "setup" ? selected : artist;
  useEffect(() => {
    if (!board) return;
    getLeaderboard("artista", board, "all")
      .then((r) => setFans(r.top))
      .catch(() => setFans([]));
  }, [board, phase]);

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

  useAutoplay(status, round?.audioUrl ?? null, phase === "playing" && !solution, () => {
    shownAt.current = Date.now();
    playClip(SNIPPET_MS);
  });

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
    setFans([]);
    answerMs.current = 0;
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
    if (shownAt.current) answerMs.current += Date.now() - shownAt.current;
    const res = await answerRound(round.roundId, optionId);
    setSolution(res.solution);
    if (res.correct) setHits((h) => h + 1);
  }

  async function next() {
    const nextIndex = index + 1;
    const finalHits = hits;
    if (nextIndex >= TOTAL_ROUNDS) {
      setScore(artistScore(finalHits, answerMs.current / TOTAL_ROUNDS));
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

  function choose(name: string) {
    setFans([]);
    setSelected(name);
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
              onChange={(e) => {
                setQuery(e.target.value);
                setSelected(null);
              }}
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
                  data-active={selected === name}
                  onClick={() => choose(name)}
                >
                  {selected === name && <span className="absolute inset-0 rounded-full bg-accent" />}
                  <span className="relative">{name}</span>
                </motion.button>
              ))}
            </AnimatePresence>
          </div>
          {error && <p className="text-sm font-semibold text-coral">{error}</p>}
          <button
            type="button"
            className="btn-accent w-full"
            disabled={!selected && !query.trim()}
            onClick={() => start(selected ?? query.trim())}
          >
            {selected ? `Jugar a ${selected}` : "Empezar"}
          </button>
          <AnimatePresence mode="wait">
            {selected ? (
              <motion.div key={selected} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
                <Leaderboard
                  entries={fans}
                  title={`Top fans de ${selected}`}
                  format={formatArtistScore}
                  emptyText="Nadie jugó este artista todavía. El primer puesto es tuyo."
                />
              </motion.div>
            ) : (
              popular.length > 0 && (
                <motion.div key="popular" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
                  <p className="eyebrow">Los más desafiados</p>
                  <div className="flex flex-wrap gap-2">
                    {popular.map((b) => (
                      <button key={b.artist} type="button" className="chip flex items-center gap-1.5" onClick={() => choose(b.artist)}>
                        {b.artist}
                        <span className="flex items-center gap-1 text-xs text-white/40">
                          <Crown size={11} strokeWidth={2.6} />
                          {b.leader.name}
                        </span>
                      </button>
                    ))}
                  </div>
                </motion.div>
              )
            )}
          </AnimatePresence>
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
          <ScoreSubmit
            submit={(name) => submitScore({ mode: "artista", categoryId: artist, name, score, period: "all" })}
            onResult={(r) => {
              setFans(r.top);
              if (r.rank === 1) celebrate(undefined, true);
            }}
            resultText={(rank) =>
              rank === 1
                ? `Sos el fan número 1 de ${artist}`
                : rank
                  ? `Quedaste #${rank} entre los fans de ${artist}`
                  : "Esta vez no entraste al top 50"
            }
          />
          <Leaderboard
            entries={fans}
            title={`Top fans de ${artist}`}
            format={formatArtistScore}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <button type="button" className="btn-accent w-full" onClick={() => start(artist)}>
              <RotateCcw size={18} strokeWidth={2.6} />
              Revancha
            </button>
            <button
              type="button"
              className="btn-ghost w-full"
              onClick={() => {
                setSelected(null);
                setPhase("setup");
              }}
            >
              Otro artista
            </button>
          </div>
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
