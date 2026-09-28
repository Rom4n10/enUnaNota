"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Shell } from "@/components/Shell";
import { useProfile } from "@/lib/useProfile";

const MODES = [
  {
    href: "/diario",
    emoji: "📅",
    title: "En Una Nota",
    tagline: "Desafío diario",
    detail: "Un tema por día para todo el mundo. 6 intentos: 0.8s, 1.5s, 3s, 6s, 12s y 30s.",
    accent: "from-fuchsia-500/25 to-violet-500/10",
  },
  {
    href: "/rush",
    emoji: "⏱️",
    title: "Rush",
    tagline: "Contrarreloj",
    detail: "45 segundos en el reloj. Acertás +4s, errás -6s. Combo x2 en modo Fiebre.",
    accent: "from-amber-500/25 to-rose-500/10",
  },
  {
    href: "/sala",
    emoji: "🎉",
    title: "Sala de Amigos",
    tagline: "2 a 12 jugadores",
    detail:
      "Código de 4 letras, audio sincronizado, buzzer y la Subasta de Segundos: el que menos segundos apuesta se juega el tema.",
    accent: "from-sky-500/25 to-emerald-500/10",
  },
  {
    href: "/artista",
    emoji: "🏅",
    title: "Desafío de Artista",
    tagline: "Discografía",
    detail: "10 temas de un artista escuchando solo el primer segundo. Ganás insignias.",
    accent: "from-emerald-500/25 to-cyan-500/10",
  },
  {
    href: "/anio",
    emoji: "🕰️",
    title: "Adiviná el año",
    tagline: "Máquina del tiempo",
    detail: "8 segundos por tema y cuatro años posibles. ¿Sabés de qué época es cada hit?",
    accent: "from-indigo-500/25 to-fuchsia-500/10",
  },
  {
    href: "/linea",
    emoji: "🧭",
    title: "Time Machine",
    tagline: "Línea de tiempo",
    detail: "2,5 segundos y a ubicar el tema en tu línea. Cada acierto la hace más difícil.",
    accent: "from-violet-500/25 to-sky-500/10",
  },
  {
    href: "/impostor",
    emoji: "🕵️",
    title: "El Impostor",
    tagline: "Tres fragmentos",
    detail: "Dos clips son del mismo artista y uno se coló. Encontrá al impostor en 1,5s.",
    accent: "from-amber-500/25 to-lime-500/10",
  },
  {
    href: "/cadena",
    emoji: "🔗",
    title: "Cadena de Feats",
    tagline: "6 grados",
    detail: "Bizarrap → Quevedo → Duki… acertá la colaboración y seguí la cadena contrarreloj.",
    accent: "from-emerald-500/25 to-teal-500/10",
  },
];

export default function Home() {
  const profile = useProfile();

  return (
    <Shell back={false}>
      <section className="space-y-3">
        <motion.h1
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-4xl font-black leading-tight sm:text-5xl"
        >
          Adiviná la canción
          <span className="block text-fuchsia-400">en una nota.</span>
        </motion.h1>
        <p className="max-w-xl text-white/60">
          Fragmentos de milisegundos, previews reales de iTunes y cero spoilers en la consola:
          el servidor nunca te manda el título hasta que cierra la ronda.
        </p>
        {(profile.streak > 0 || profile.rushBest > 0 || profile.badges.length > 0) && (
          <div className="flex flex-wrap gap-2 text-sm">
            {profile.streak > 0 && (
              <span className="rounded-full bg-fuchsia-500/15 px-3 py-1 text-fuchsia-200">
                🔥 Racha {profile.streak} {profile.streak === 1 ? "día" : "días"}
              </span>
            )}
            {profile.rushBest > 0 && (
              <span className="rounded-full bg-amber-500/15 px-3 py-1 text-amber-200">
                ⏱️ Récord Rush {profile.rushBest}
              </span>
            )}
            {profile.badges.map((badge) => (
              <span key={badge} className="rounded-full bg-emerald-500/15 px-3 py-1 text-emerald-200">
                🏅 {badge}
              </span>
            ))}
          </div>
        )}
      </section>

      <section className="grid gap-4 sm:grid-cols-2">
        {MODES.map((mode, index) => (
          <motion.div
            key={mode.href}
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05 * index }}
          >
            <Link
              href={mode.href}
              className={`card group flex h-full flex-col gap-2 bg-gradient-to-br p-5 transition hover:border-white/25 ${mode.accent}`}
            >
              <div className="flex items-center gap-3">
                <span className="text-3xl">{mode.emoji}</span>
                <div>
                  <p className="text-lg font-bold">{mode.title}</p>
                  <p className="text-xs uppercase tracking-widest text-white/45">{mode.tagline}</p>
                </div>
              </div>
              <p className="text-sm text-white/65">{mode.detail}</p>
              <span className="mt-auto pt-3 text-sm font-semibold text-fuchsia-300 transition group-hover:translate-x-1">
                Jugar →
              </span>
            </Link>
          </motion.div>
        ))}
      </section>

      <footer className="pb-6 text-center text-xs text-white/35">
        Audio: previews de 30 segundos de la Apple iTunes Search API, servidos por proxy.
      </footer>
    </Shell>
  );
}
