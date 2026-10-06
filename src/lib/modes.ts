import {
  Award,
  CalendarDays,
  History,
  Link2,
  Route,
  Timer,
  Users,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import type { CSSProperties } from "react";

export type ModeId = "diario" | "rush" | "sala" | "artista" | "anio" | "linea" | "impostor" | "cadena";

export type ModeInfo = {
  id: ModeId;
  href: string;
  title: string;
  tagline: string;
  detail: string;
  icon: LucideIcon;
  color: string;
};

export const MODES: ModeInfo[] = [
  {
    id: "diario",
    href: "/diario",
    title: "En Una Nota",
    tagline: "Desafío diario",
    detail: "Un tema por día para todo el mundo. 6 intentos: de 0,8 segundos hasta el tema entero.",
    icon: CalendarDays,
    color: "#c8ff2e",
  },
  {
    id: "sala",
    href: "/sala",
    title: "Sala de Amigos",
    tagline: "2 a 12 jugadores",
    detail: "Código de 4 letras, audio sincronizado, Buzzer y Subasta de Segundos.",
    icon: Users,
    color: "#ff3d8b",
  },
  {
    id: "rush",
    href: "/rush",
    title: "Rush",
    tagline: "Contrarreloj",
    detail: "45 segundos en el reloj. Acertás +4s, errás -6s. Combo x2 en modo Fiebre.",
    icon: Timer,
    color: "#ff8a1f",
  },
  {
    id: "linea",
    href: "/linea",
    title: "Time Machine",
    tagline: "Línea de tiempo",
    detail: "2,5 segundos para ubicar el tema en tu línea. Cada acierto la hace más difícil.",
    icon: Route,
    color: "#8c6cff",
  },
  {
    id: "impostor",
    href: "/impostor",
    title: "El Impostor",
    tagline: "Tres fragmentos",
    detail: "Dos clips son del mismo artista y uno se coló. Encontralo en 1,5 segundos.",
    icon: VenetianMask,
    color: "#ff5e5b",
  },
  {
    id: "cadena",
    href: "/cadena",
    title: "Cadena de Feats",
    tagline: "6 grados",
    detail: "Bizarrap, Quevedo, Duki… acertá la colaboración y seguí la cadena contrarreloj.",
    icon: Link2,
    color: "#22e5a0",
  },
  {
    id: "artista",
    href: "/artista",
    title: "Desafío de Artista",
    tagline: "Discografía",
    detail: "10 temas de un artista escuchando solo el primer segundo. Ganás insignias.",
    icon: Award,
    color: "#ffd23f",
  },
  {
    id: "anio",
    href: "/anio",
    title: "Adiviná el año",
    tagline: "Máquina del tiempo",
    detail: "8 segundos por tema y cuatro años posibles. ¿De qué época es cada hit?",
    icon: History,
    color: "#3db8ff",
  },
];

export function modeOf(id: ModeId): ModeInfo {
  return MODES.find((m) => m.id === id) ?? MODES[0];
}

/** Scopes the `--accent` CSS variable so buttons, tiles and focus rings take the mode color. */
export function accentStyle(color: string): CSSProperties {
  return { "--accent": color } as CSSProperties;
}
