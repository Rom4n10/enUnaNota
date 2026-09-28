/**
 * Weekly in-memory leaderboards. Scores reset every Monday 00:00 UTC so nobody
 * becomes unreachable and there is a reason to come back each week.
 */
export type Entry = { name: string; score: number; at: number };

const MAX_ENTRIES = 50;
const boards = new Map<string, Entry[]>();

export function weekKey(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function keyFor(mode: string, categoryId: string): string {
  return `${weekKey()}|${mode}|${categoryId}`;
}

export function topScores(mode: string, categoryId: string, limit = 10): Entry[] {
  return (boards.get(keyFor(mode, categoryId)) ?? []).slice(0, limit);
}

/** Stores the score and returns its 1-based position, or null if it didn't rank. */
export function submitScore(
  mode: string,
  categoryId: string,
  name: string,
  score: number,
): { rank: number | null; top: Entry[] } {
  const key = keyFor(mode, categoryId);
  const entries = boards.get(key) ?? [];
  const entry: Entry = { name: name.slice(0, 16) || "Anónimo", score, at: Date.now() };
  const next = [...entries, entry].sort((a, b) => b.score - a.score || a.at - b.at).slice(0, MAX_ENTRIES);
  boards.set(key, next);
  const index = next.indexOf(entry);
  return { rank: index === -1 ? null : index + 1, top: next.slice(0, 10) };
}
