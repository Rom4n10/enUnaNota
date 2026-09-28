import { DAILY_POOL_CATEGORIES } from "./catalog.js";
import { getCategoryTracks, type Track } from "./itunes.js";
import { createRound, label, type Round } from "./rounds.js";

export const DAILY_STEPS_MS = [800, 1500, 3000, 6000, 12000, 30000];
export const DAILY_MAX_ATTEMPTS = DAILY_STEPS_MS.length;

export function todayKey(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}

function hash(str: string): number {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type DailyPuzzle = { date: string; round: Round; pool: Track[] };

let current: DailyPuzzle | null = null;
let building: Promise<DailyPuzzle> | null = null;

async function build(date: string): Promise<DailyPuzzle> {
  const rand = mulberry32(hash(date));
  const categoryId = DAILY_POOL_CATEGORIES[Math.floor(rand() * DAILY_POOL_CATEGORIES.length)];
  const pool = (await getCategoryTracks(categoryId)).sort((a, b) => a.trackId - b.trackId);
  if (pool.length === 0) throw new Error("no tracks available for daily puzzle");
  const answer = pool[Math.floor(rand() * pool.length)];
  const round = createRound(answer, pool, false);
  return { date, round, pool };
}

export async function getDaily(): Promise<DailyPuzzle> {
  const date = todayKey();
  if (current?.date === date) return current;
  if (!building) {
    building = build(date)
      .then((puzzle) => {
        current = puzzle;
        return puzzle;
      })
      .finally(() => {
        building = null;
      });
  }
  return building;
}

/** Autocomplete candidates for the daily guess box (includes the answer). */
export function dailyChoices(puzzle: DailyPuzzle): string[] {
  return [...new Set(puzzle.pool.map(label))].sort((a, b) => a.localeCompare(b, "es"));
}

export function msUntilNextPuzzle(now = new Date()): number {
  const next = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + 1);
  return next - now.getTime();
}
