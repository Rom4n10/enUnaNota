/**
 * Leaderboards. Scores are grouped by week (reset every Monday 00:00 UTC) and can
 * also be read across all weeks. Persisted in Supabase when configured, otherwise
 * kept in memory.
 */
import { count, dbEnabled, insert, select } from "./db.js";

export type Entry = { name: string; score: number; at: number };
export type Period = "week" | "all";
export type ArtistBoard = { artist: string; plays: number; leader: Entry };

export const ARTIST_MODE = "artista";

const MAX_ENTRIES = 50;
const TOP = 10;
const TOP_ARTISTS = 12;

type Board = { categoryId: string; entries: Entry[] };
const boards = new Map<string, Board>();

type ScoreRow = { id: number; name: string; score: number; created_at: string };
type ArtistRow = ScoreRow & { category_id: string };

export function weekKey(now = new Date()): string {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  const day = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - day);
  return date.toISOString().slice(0, 10);
}

/** Artist boards are matched case-insensitively so "duki" and "Duki" share a ranking. */
function categoryKey(mode: string, categoryId: string): string {
  return mode === ARTIST_MODE ? categoryId.toLowerCase() : categoryId;
}

function keyFor(mode: string, categoryId: string, week = weekKey()): string {
  return `${week}|${mode}|${categoryKey(mode, categoryId)}`;
}

const escapeLike = (value: string) => value.replace(/[\\%_*]/g, (c) => `\\${c}`);

function boardQuery(mode: string, categoryId: string, period: Period = "week"): URLSearchParams {
  const query = new URLSearchParams({
    mode: `eq.${mode}`,
    category_id: mode === ARTIST_MODE ? `ilike.${escapeLike(categoryId)}` : `eq.${categoryId}`,
  });
  if (period === "week") query.set("week", `eq.${weekKey()}`);
  return query;
}

const toEntry = (row: ScoreRow): Entry => ({ name: row.name, score: row.score, at: Date.parse(row.created_at) });
const byScore = (a: Entry, b: Entry) => b.score - a.score || a.at - b.at;

async function dbTop(mode: string, categoryId: string, period: Period): Promise<Entry[]> {
  const query = boardQuery(mode, categoryId, period);
  query.set("select", "id,name,score,created_at");
  query.set("order", "score.desc,id.asc");
  query.set("limit", String(TOP));
  return (await select<ScoreRow>("scores", query)).map(toEntry);
}

function memoryBoards(mode: string, period: Period): [string, Board][] {
  const week = weekKey();
  return [...boards].filter(([key]) => {
    const [boardWeek, boardMode] = key.split("|");
    return boardMode === mode && (period === "all" || boardWeek === week);
  });
}

function memoryTop(mode: string, categoryId: string, period: Period): Entry[] {
  if (period === "week") return (boards.get(keyFor(mode, categoryId))?.entries ?? []).slice(0, TOP);
  const wanted = categoryKey(mode, categoryId);
  return memoryBoards(mode, "all")
    .filter(([key]) => key.split("|").slice(2).join("|") === wanted)
    .flatMap(([, board]) => board.entries)
    .sort(byScore)
    .slice(0, TOP);
}

function memorySubmit(mode: string, categoryId: string, entry: Entry, period: Period) {
  const key = keyFor(mode, categoryId);
  const board = boards.get(key) ?? { categoryId, entries: [] };
  const entries = [...board.entries, entry].sort(byScore).slice(0, MAX_ENTRIES);
  boards.set(key, { categoryId: board.categoryId, entries });
  if (!entries.includes(entry)) return { rank: null, top: memoryTop(mode, categoryId, period) };
  const wanted = categoryKey(mode, categoryId);
  const pool =
    period === "week"
      ? entries
      : memoryBoards(mode, "all")
          .filter(([boardKey]) => boardKey.split("|").slice(2).join("|") === wanted)
          .flatMap(([, b]) => b.entries)
          .sort(byScore);
  const rank = pool.indexOf(entry) + 1;
  return { rank: rank <= MAX_ENTRIES ? rank : null, top: pool.slice(0, TOP) };
}

export async function topScores(mode: string, categoryId: string, period: Period = "week"): Promise<Entry[]> {
  if (!dbEnabled) return memoryTop(mode, categoryId, period);
  try {
    return await dbTop(mode, categoryId, period);
  } catch (err) {
    console.error("topScores", err);
    return memoryTop(mode, categoryId, period);
  }
}

/** Stores the score and returns its 1-based position in `period`, or null if it didn't rank. */
export async function submitScore(
  mode: string,
  categoryId: string,
  name: string,
  score: number,
  period: Period = "week",
): Promise<{ rank: number | null; top: Entry[] }> {
  const cleanName = name.slice(0, 16) || "Anónimo";
  const entry: Entry = { name: cleanName, score, at: Date.now() };
  if (!dbEnabled) return memorySubmit(mode, categoryId, entry, period);
  try {
    const row = await insert<ScoreRow>("scores", {
      week: weekKey(),
      mode,
      category_id: categoryId,
      name: cleanName,
      score,
    });
    const higher = boardQuery(mode, categoryId, period);
    higher.set("or", `(score.gt.${score},and(score.eq.${score},id.lt.${row.id}))`);
    const [ahead, top] = await Promise.all([count("scores", higher), dbTop(mode, categoryId, period)]);
    const rank = ahead + 1;
    return { rank: rank <= MAX_ENTRIES ? rank : null, top };
  } catch (err) {
    console.error("submitScore", err);
    return memorySubmit(mode, categoryId, entry, period);
  }
}

function rankArtists(rows: { categoryId: string; entry: Entry }[]): ArtistBoard[] {
  const grouped = new Map<string, ArtistBoard>();
  for (const { categoryId, entry } of rows) {
    const key = categoryId.toLowerCase();
    const board = grouped.get(key);
    if (!board) grouped.set(key, { artist: categoryId, plays: 1, leader: entry });
    else {
      board.plays += 1;
      if (board.artist === board.artist.toLowerCase() && categoryId !== categoryId.toLowerCase()) {
        board.artist = categoryId;
      }
      if (byScore(entry, board.leader) < 0) board.leader = entry;
    }
  }
  return [...grouped.values()]
    .sort((a, b) => b.plays - a.plays || byScore(a.leader, b.leader))
    .slice(0, TOP_ARTISTS);
}

/** Most played artist challenges with their current leader. */
export async function topArtists(period: Period = "week"): Promise<ArtistBoard[]> {
  const fromMemory = () =>
    rankArtists(
      memoryBoards(ARTIST_MODE, period).flatMap(([, board]) =>
        board.entries.map((entry) => ({ categoryId: board.categoryId, entry })),
      ),
    );
  if (!dbEnabled) return fromMemory();
  try {
    const query = new URLSearchParams({
      mode: `eq.${ARTIST_MODE}`,
      select: "id,category_id,name,score,created_at",
      order: "id.desc",
      limit: "2000",
    });
    if (period === "week") query.set("week", `eq.${weekKey()}`);
    const rows = await select<ArtistRow>("scores", query);
    return rankArtists(rows.map((row) => ({ categoryId: row.category_id, entry: toEntry(row) })));
  } catch (err) {
    console.error("topArtists", err);
    return fromMemory();
  }
}
