"use client";

import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { ArrowRight, Crown, Search, Trophy, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Leaderboard } from "@/components/Leaderboard";
import { Segmented } from "@/components/Segmented";
import { Shell } from "@/components/Shell";
import { getCategories, getLeaderboard, getTopArtists, suggestArtists, type Period } from "@/lib/api";
import { formatArtistScore } from "@/lib/artistScore";
import { accentStyle, modeOf } from "@/lib/modes";
import type { ArtistBoard, Category, ScoreEntry } from "@/lib/types";

type Tab = "artista" | "rush" | "year";

const TABS: { id: Tab; label: string; color: string; href: string }[] = [
  { id: "artista", label: "Por artista", color: modeOf("artista").color, href: "/artista" },
  { id: "rush", label: "Rush", color: modeOf("rush").color, href: "/rush" },
  { id: "year", label: "Adiviná el año", color: modeOf("anio").color, href: "/anio" },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "week", label: "Esta semana" },
  { id: "all", label: "Histórico" },
];

function ArtistRanking({ period }: { period: Period }) {
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [popular, setPopular] = useState<ArtistBoard[] | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [fans, setFans] = useState<ScoreEntry[] | null>(null);

  useEffect(() => {
    getTopArtists(period)
      .then(setPopular)
      .catch(() => setPopular([]));
  }, [period]);

  useEffect(() => {
    if (!selected) return;
    getLeaderboard("artista", selected, period)
      .then((r) => setFans(r.top))
      .catch(() => setFans([]));
  }, [selected, period]);

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

  function choose(name: string) {
    setFans(null);
    setSelected(name);
    setQuery("");
  }

  return (
    <div className="space-y-5">
      <div className="space-y-3">
        <div className="relative">
          <Search size={18} className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && query.trim() && choose(query.trim())}
            placeholder="Buscá un artista: Duki, Soda Stereo…"
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
                onClick={() => choose(name)}
              >
                {name}
              </motion.button>
            ))}
          </AnimatePresence>
        </div>
      </div>

      <AnimatePresence mode="wait">
        {selected ? (
          <motion.div
            key={selected}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
            className="space-y-4"
          >
            <div className="flex items-center justify-between gap-3">
              <h2 className="truncate font-display text-2xl font-extrabold">{selected}</h2>
              <button
                type="button"
                aria-label="Ver todos los artistas"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-full border border-white/10 bg-white/5 text-white/60 transition hover:text-white"
                onClick={() => setSelected(null)}
              >
                <X size={16} />
              </button>
            </div>
            {fans === null ? (
              <div className="space-y-1.5">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="skeleton h-10 rounded-xl" />
                ))}
              </div>
            ) : (
              <Leaderboard
                entries={fans}
                limit={10}
                title={`Top fans de ${selected}`}
                format={formatArtistScore}
                emptyText="Nadie jugó este artista todavía. Sé el primero en el top."
              />
            )}
            <Link href="/artista" className="btn-accent w-full">
              Jugar el desafío de artista
              <ArrowRight size={18} strokeWidth={2.6} />
            </Link>
          </motion.div>
        ) : (
          <motion.div key="popular" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="space-y-2">
            <p className="eyebrow flex items-center gap-1.5">
              <Trophy size={13} strokeWidth={2.6} />
              Artistas más jugados
            </p>
            {popular === null &&
              Array.from({ length: 4 }, (_, i) => <div key={i} className="skeleton h-16 rounded-2xl" />)}
            {popular?.length === 0 && (
              <p className="rounded-xl border border-dashed border-white/10 px-3 py-4 text-center text-sm text-white/45">
                Todavía no hay puntajes. Jugá un desafío de artista y estrená el ranking.
              </p>
            )}
            <div className="grid gap-2 sm:grid-cols-2">
              {popular?.map((board, i) => (
                <motion.button
                  key={board.artist}
                  type="button"
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.04, type: "spring", stiffness: 380, damping: 26 }}
                  whileHover={{ y: -3 }}
                  whileTap={{ scale: 0.97 }}
                  onClick={() => choose(board.artist)}
                  className="group flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.04] p-3 text-left transition-colors hover:border-accent/60"
                >
                  <span className="tile h-10 w-10 shrink-0 font-display text-sm font-extrabold">{i + 1}</span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate font-display font-extrabold">{board.artist}</span>
                    <span className="flex items-center gap-1 truncate text-xs text-white/50">
                      <Crown size={12} strokeWidth={2.6} className="text-accent" />
                      {board.leader.name} · {formatArtistScore(board.leader.score)}
                    </span>
                  </span>
                  <span className="pill shrink-0 text-xs">
                    {board.plays} {board.plays === 1 ? "partida" : "partidas"}
                  </span>
                </motion.button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ModeRanking({ mode, href, period }: { mode: "rush" | "year"; href: string; period: Period }) {
  const [categories, setCategories] = useState<Category[]>([]);
  const [categoryId, setCategoryId] = useState("all");
  const [top, setTop] = useState<ScoreEntry[] | null>(null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    getLeaderboard(mode, categoryId, period)
      .then((r) => setTop(r.top))
      .catch(() => setTop([]));
  }, [mode, categoryId, period]);

  return (
    <div className="space-y-5">
      <CategoryPicker
        categories={categories}
        value={categoryId}
        onChange={(id) => {
          setTop(null);
          setCategoryId(id);
        }}
      />
      {top === null ? (
        <div className="space-y-1.5">
          {Array.from({ length: 4 }, (_, i) => (
            <div key={i} className="skeleton h-10 rounded-xl" />
          ))}
        </div>
      ) : (
        <Leaderboard
          entries={top}
          limit={10}
          title={period === "week" ? "Top de la semana" : "Top histórico"}
          emptyText="Nadie subió puntaje acá todavía. El primer puesto está libre."
        />
      )}
      <Link href={href} className="btn-accent w-full">
        Jugar y entrar al ranking
        <ArrowRight size={18} strokeWidth={2.6} />
      </Link>
    </div>
  );
}

export default function RankingsPage() {
  const [tab, setTab] = useState<Tab>("artista");
  const [period, setPeriod] = useState<Period>("all");
  const current = TABS.find((t) => t.id === tab) ?? TABS[0];

  return (
    <Shell style={accentStyle(current.color)}>
      <div className="flex items-start gap-4">
        <motion.span
          initial={{ scale: 0.4, rotate: -20, opacity: 0 }}
          animate={{ scale: 1, rotate: 0, opacity: 1 }}
          transition={{ type: "spring", stiffness: 380, damping: 16 }}
          className="tile h-14 w-14 shrink-0"
        >
          <Trophy size={28} strokeWidth={2.4} />
        </motion.span>
        <div className="space-y-1">
          <p className="eyebrow">Quién sabe más</p>
          <h1 className="font-display text-3xl font-extrabold leading-none sm:text-4xl">Rankings</h1>
          <p className="pt-1 text-sm leading-relaxed text-white/60">
            Los mejores de cada modo y los fans número uno de cada artista.
          </p>
        </div>
      </div>

      <section className="card space-y-5 p-5 sm:p-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <Segmented
            options={TABS}
            value={tab}
            onChange={(id) => setTab(id)}
          />
          <Segmented options={PERIODS} value={period} onChange={setPeriod} />
        </div>
        {tab === "artista" ? (
          <ArtistRanking period={period} />
        ) : (
          <ModeRanking key={tab} mode={tab} href={current.href} period={period} />
        )}
      </section>
    </Shell>
  );
}
