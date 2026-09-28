"use client";

export type DailyResult = {
  date: string;
  attempts: ("skip" | "fail" | "win")[];
  won: boolean;
  finished: boolean;
};

export type Profile = {
  nickname: string;
  streak: number;
  bestStreak: number;
  lastPlayed: string | null;
  badges: string[];
  rushBest: number;
};

const PROFILE_KEY = "eun:profile";
const dailyKey = (date: string) => `eun:daily:${date}`;

const EMPTY_PROFILE: Profile = {
  nickname: "",
  streak: 0,
  bestStreak: 0,
  lastPlayed: null,
  badges: [],
  rushBest: 0,
};

function read<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? ({ ...fallback, ...JSON.parse(raw) } as T) : fallback;
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable (private mode) */
  }
}

const listeners = new Set<() => void>();
let cached: Profile | null = null;

export function getProfile(): Profile {
  if (!cached) cached = read(PROFILE_KEY, EMPTY_PROFILE);
  return cached;
}

export function updateProfile(patch: Partial<Profile>): Profile {
  const next = { ...getProfile(), ...patch };
  cached = next;
  write(PROFILE_KEY, next);
  listeners.forEach((l) => l());
  return next;
}

export function subscribeProfile(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Stable snapshot for SSR, where localStorage does not exist. */
export const serverProfile = (): Profile => EMPTY_PROFILE;

export const getDailyResult = (date: string): DailyResult | null =>
  read<DailyResult | null>(dailyKey(date), null);

export const saveDailyResult = (result: DailyResult) => write(dailyKey(result.date), result);

function yesterdayOf(date: string): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** Streak counts consecutive UTC days with a solved daily puzzle. */
export function registerDailyWin(date: string, won: boolean): Profile {
  const profile = getProfile();
  if (profile.lastPlayed === date) return profile;
  const continues = won && profile.lastPlayed === yesterdayOf(date);
  const streak = won ? (continues ? profile.streak + 1 : 1) : 0;
  return updateProfile({
    lastPlayed: date,
    streak,
    bestStreak: Math.max(profile.bestStreak, streak),
  });
}

export function awardBadge(badge: string): Profile {
  const profile = getProfile();
  if (profile.badges.includes(badge)) return profile;
  return updateProfile({ badges: [...profile.badges, badge] });
}

export function buildShareGrid(result: DailyResult, maxAttempts: number): string {
  const cells = Array.from({ length: maxAttempts }, (_, i) => {
    const attempt = result.attempts[i];
    if (attempt === "win") return "🟩";
    if (attempt === "fail") return "🟥";
    if (attempt === "skip") return "⬜";
    return "⬛";
  }).join("");
  const score = result.won ? `${result.attempts.length}/${maxAttempts}` : `X/${maxAttempts}`;
  return `🎵 En Una Nota ${result.date} ${score}\n${cells}`;
}
