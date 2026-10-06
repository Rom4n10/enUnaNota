import { dbEnabled, insertQuiet, rpc } from "./db.js";

export type GameRecord = {
  mode: string;
  categoryId?: string | null;
  players?: number;
  score?: number | null;
};

export type GameStats = {
  total: number;
  today: number;
  week: number;
  players: number;
  byMode: Record<string, number>;
};

/** Fire-and-forget: a failed insert must never break a game. */
export function recordGame({ mode, categoryId = null, players = 1, score = null }: GameRecord): void {
  if (!dbEnabled) return;
  insertQuiet("games", {
    mode: mode.slice(0, 32),
    category_id: categoryId ? categoryId.slice(0, 64) : null,
    players: Math.max(1, Math.min(players, 50)),
    score: score === null ? null : Math.max(0, Math.round(score)),
  }).catch((err: unknown) => console.error("recordGame", err));
}

export async function gameStats(): Promise<GameStats | null> {
  if (!dbEnabled) return null;
  return rpc<GameStats>("game_stats");
}
