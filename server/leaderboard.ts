/**
 * Weekly leaderboards. Scores reset every Monday 00:00 UTC so nobody becomes
 * unreachable and there is a reason to come back each week. Persisted in
 * Supabase when configured, otherwise kept in memory.
 */
import { count, dbEnabled, insert, select } from "./db.js";

export type Entry = { name: string; score: number; at: number };

const MAX_ENTRIES = 50;
const TOP = 10;
const boards = new Map<string, Entry[]>();

type ScoreRow = { id: number; name: string; score: number; created_at: string };

export function weekKey(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

function keyFor(mode: string, categoryId: string): string {
  return `${weekKey()}|${mode}|${categoryId}`;
}

function boardQuery(mode: string, categoryId: string): URLSearchParams {
  return new URLSearchParams({
    week: `eq.${weekKey()}`,
    mode: `eq.${mode}`,
    category_id: `eq.${categoryId}`,
  });
}

const toEntry = (row: ScoreRow): Entry => ({ name: row.name, score: row.score, at: Date.parse(row.created_at) });

async function dbTop(mode: string, categoryId: string): Promise<Entry[]> {
  const query = boardQuery(mode, categoryId);
  query.set("select", "id,name,score,created_at");
  query.set("order", "score.desc,id.asc");
  query.set("limit", String(TOP));
  return (await select<ScoreRow>("scores", query)).map(toEntry);
}

function memoryTop(mode: string, categoryId: string): Entry[] {
  return (boards.get(keyFor(mode, categoryId)) ?? []).slice(0, TOP);
}

function memorySubmit(mode: string, categoryId: string, entry: Entry) {
  const key = keyFor(mode, categoryId);
  const next = [...(boards.get(key) ?? []), entry]
    .sort((a, b) => b.score - a.score || a.at - b.at)
    .slice(0, MAX_ENTRIES);
  boards.set(key, next);
  const index = next.indexOf(entry);
  return { rank: index === -1 ? null : index + 1, top: next.slice(0, TOP) };
}

export async function topScores(mode: string, categoryId: string): Promise<Entry[]> {
  if (!dbEnabled) return memoryTop(mode, categoryId);
  try {
    return await dbTop(mode, categoryId);
  } catch (err) {
    console.error("topScores", err);
    return memoryTop(mode, categoryId);
  }
}

/** Stores the score and returns its 1-based position, or null if it didn't rank. */
export async function submitScore(
  mode: string,
  categoryId: string,
  name: string,
  score: number,
): Promise<{ rank: number | null; top: Entry[] }> {
  const cleanName = name.slice(0, 16) || "Anónimo";
  const entry: Entry = { name: cleanName, score, at: Date.now() };
  if (!dbEnabled) return memorySubmit(mode, categoryId, entry);
  try {
    const row = await insert<ScoreRow>("scores", {
      week: weekKey(),
      mode,
      category_id: categoryId,
      name: cleanName,
      score,
    });
    const higher = boardQuery(mode, categoryId);
    higher.set("or", `(score.gt.${score},and(score.eq.${score},id.lt.${row.id}))`);
    const [ahead, top] = await Promise.all([count("scores", higher), dbTop(mode, categoryId)]);
    const rank = ahead + 1;
    return { rank: rank <= MAX_ENTRIES ? rank : null, top };
  } catch (err) {
    console.error("submitScore", err);
    return memorySubmit(mode, categoryId, entry);
  }
}
