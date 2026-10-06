"use client";

import Link from "next/link";
import { motion } from "motion/react";
import { ArrowRight, Award, Flame, Timer } from "lucide-react";
import { Shell } from "@/components/Shell";
import { accentStyle, MODES, type ModeInfo } from "@/lib/modes";
import { useProfile } from "@/lib/useProfile";

const HERO_WORDS = ["Adiviná", "la", "canción"];

function ModeCard({ mode, index, featured = false }: { mode: ModeInfo; index: number; featured?: boolean }) {
  const Icon = mode.icon;
  return (
    <motion.div
      initial={{ opacity: 0, y: 24, scale: 0.97 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={{ delay: 0.15 + 0.05 * index, type: "spring", stiffness: 260, damping: 24 }}
      whileHover={{ y: -5 }}
      whileTap={{ scale: 0.97 }}
      style={accentStyle(mode.color)}
      className={featured ? "sm:col-span-2" : ""}
    >
      <Link
        href={mode.href}
        className={`card group flex h-full overflow-hidden transition-colors hover:border-accent/60 ${
          featured ? "flex-col gap-5 p-6 sm:flex-row sm:items-center sm:p-7" : "flex-col gap-3 p-5"
        }`}
      >
        <span
          aria-hidden
          className="pointer-events-none absolute -right-16 -top-16 h-44 w-44 rounded-full bg-accent opacity-[0.08] blur-2xl transition-opacity duration-500 group-hover:opacity-25"
        />
        <motion.span
          className={`tile shrink-0 transition-transform duration-300 group-hover:-rotate-6 group-hover:scale-110 ${
            featured ? "h-16 w-16" : "h-12 w-12"
          }`}
        >
          <Icon size={featured ? 32 : 24} strokeWidth={2.4} />
        </motion.span>
        <div className="flex-1 space-y-1.5">
          <p className="eyebrow">{mode.tagline}</p>
          <p className={`font-display font-extrabold leading-tight ${featured ? "text-3xl" : "text-xl"}`}>
            {mode.title}
          </p>
          <p className="text-sm leading-relaxed text-white/60">{mode.detail}</p>
        </div>
        {featured ? (
          <span className="btn-accent shrink-0 self-start sm:self-center">
            Jugar el de hoy
            <ArrowRight size={18} strokeWidth={2.6} className="transition-transform group-hover:translate-x-1" />
          </span>
        ) : (
          <span className="mt-auto flex items-center gap-1.5 pt-2 font-display text-sm font-extrabold text-accent">
            Jugar
            <ArrowRight size={16} strokeWidth={2.6} className="transition-transform group-hover:translate-x-1.5" />
          </span>
        )}
      </Link>
    </motion.div>
  );
}

export default function Home() {
  const profile = useProfile();
  const [daily, ...rest] = MODES;

  return (
    <Shell back={false} wide>
      <section className="space-y-4 pt-2 sm:pt-6">
        <h1 className="font-display text-[44px] font-extrabold leading-[0.95] sm:text-7xl">
          <span className="flex flex-wrap gap-x-3">
            {HERO_WORDS.map((word, i) => (
              <motion.span
                key={word}
                initial={{ opacity: 0, y: 30, rotate: 4 }}
                animate={{ opacity: 1, y: 0, rotate: 0 }}
                transition={{ delay: i * 0.08, type: "spring", stiffness: 300, damping: 20 }}
              >
                {word}
              </motion.span>
            ))}
          </span>
          <motion.span
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: 0.3, type: "spring", stiffness: 260, damping: 14 }}
            className="relative mt-1 inline-block text-lime"
          >
            en una nota.
            <motion.span
              aria-hidden
              initial={{ scaleX: 0 }}
              animate={{ scaleX: 1 }}
              transition={{ delay: 0.55, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
              className="absolute -bottom-1 left-0 h-1.5 w-full origin-left rounded-full bg-pink"
            />
          </motion.span>
        </h1>
        <motion.p
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.45 }}
          className="max-w-xl text-base text-white/60 sm:text-lg"
        >
          Fragmentos de milisegundos de temas reales. Jugá solo, sumate al desafío diario o armá una sala con
          amigos.
        </motion.p>
        {(profile.streak > 0 || profile.rushBest > 0 || profile.badges.length > 0) && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 }}
            className="flex flex-wrap gap-2"
          >
            {profile.streak > 0 && (
              <span className="pill" style={accentStyle("#ff8a1f")}>
                <Flame size={15} strokeWidth={2.6} />
                Racha {profile.streak} {profile.streak === 1 ? "día" : "días"}
              </span>
            )}
            {profile.rushBest > 0 && (
              <span className="pill" style={accentStyle("#3db8ff")}>
                <Timer size={15} strokeWidth={2.6} />
                Récord Rush {profile.rushBest}
              </span>
            )}
            {profile.badges.map((badge) => (
              <span key={badge} className="pill" style={accentStyle("#ffd23f")}>
                <Award size={15} strokeWidth={2.6} />
                {badge}
              </span>
            ))}
          </motion.div>
        )}
      </section>

      <section className="grid gap-3 sm:grid-cols-2 sm:gap-4 lg:grid-cols-3">
        <ModeCard mode={daily} index={0} featured />
        {rest.map((mode, i) => (
          <ModeCard key={mode.id} mode={mode} index={i + 1} />
        ))}
      </section>

      <footer className="pt-2 text-center text-xs text-white/35">
        Audio: previews de 30 segundos de la Apple iTunes Search API, servidos por proxy.
      </footer>
    </Shell>
  );
}
