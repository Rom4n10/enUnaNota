import type { Category, DailyPayload, RoundPayload, ScoreEntry, Solution } from "./types";

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, {
    ...init,
    headers: { "content-type": "application/json", ...(init?.headers ?? {}) },
  });
  if (!res.ok) throw new Error((await res.json().catch(() => ({ error: res.statusText }))).error);
  return res.json() as Promise<T>;
}

export const getCategories = () =>
  request<{ categories: Category[] }>("/api/categories").then((r) => r.categories);

export const getDaily = () => request<DailyPayload>("/api/daily");

export const guessDaily = (payload: { guess: string; attempt: number; skipped?: boolean }) =>
  request<{ correct: boolean; done: boolean; solution: Solution | null }>("/api/daily/guess", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const getRound = (categoryId: string, exclude: number[]) =>
  request<RoundPayload>("/api/round", {
    method: "POST",
    body: JSON.stringify({ categoryId, exclude }),
  });

export const getYearRound = (categoryId: string, exclude: number[]) =>
  request<RoundPayload>("/api/year/round", {
    method: "POST",
    body: JSON.stringify({ categoryId, exclude }),
  });

export const getArtistRound = (artist: string, exclude: number[]) =>
  request<RoundPayload & { total: number }>("/api/artist/round", {
    method: "POST",
    body: JSON.stringify({ artist, exclude }),
  });

export const suggestArtists = (q: string) =>
  request<{ artists: string[] }>(`/api/artist/suggest?q=${encodeURIComponent(q)}`).then(
    (r) => r.artists,
  );

export const getLeaderboard = (mode: string, categoryId: string) =>
  request<{ week: string; top: ScoreEntry[] }>(
    `/api/leaderboard?mode=${encodeURIComponent(mode)}&categoryId=${encodeURIComponent(categoryId)}`,
  );

export const submitScore = (payload: {
  mode: string;
  categoryId: string;
  name: string;
  score: number;
}) =>
  request<{ week: string; rank: number | null; top: ScoreEntry[] }>("/api/leaderboard", {
    method: "POST",
    body: JSON.stringify(payload),
  });

export const answerRound = (roundId: string, optionId: string) =>
  request<{ correct: boolean; solution: Solution }>("/api/answer", {
    method: "POST",
    body: JSON.stringify({ roundId, optionId }),
  });
