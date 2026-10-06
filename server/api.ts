import { Router } from "express";
import { streamAudio } from "./audio.js";
import { CATEGORIES } from "./catalog.js";
import {
  DAILY_MAX_ATTEMPTS,
  DAILY_STEPS_MS,
  dailyChoices,
  getDaily,
  msUntilNextPuzzle,
} from "./daily.js";
import { getArtistTracks, getCategoryTracks, searchTracks, type Track } from "./itunes.js";
import { gameStats, recordGame } from "./games.js";
import { submitScore, topScores, weekKey } from "./leaderboard.js";
import {
  chainPartner,
  createImpostorGroup,
  findCollab,
  partnerOf,
  publicImpostor,
  rememberChainPartner,
  solveImpostor,
} from "./modes.js";
import {
  createRound,
  createYearRound,
  getRound,
  matchesTitle,
  publicRound,
  shuffle,
  solutionOf,
} from "./rounds.js";

export const api = Router();

api.get("/categories", (_req, res) => {
  res.json({
    categories: CATEGORIES.map(({ id, name, emoji }) => ({ id, name, emoji })),
  });
});

api.get("/audio/:roundId", (req, res) => {
  streamAudio(req, res).catch(() => {
    if (!res.headersSent) res.status(502).json({ error: "stream_failed" });
  });
});

api.get("/daily", async (_req, res) => {
  try {
    const puzzle = await getDaily();
    res.json({
      date: puzzle.date,
      steps: DAILY_STEPS_MS,
      maxAttempts: DAILY_MAX_ATTEMPTS,
      choices: dailyChoices(puzzle),
      nextPuzzleInMs: msUntilNextPuzzle(),
      ...publicRound(puzzle.round),
    });
  } catch {
    res.status(503).json({ error: "daily_unavailable" });
  }
});

api.post("/daily/guess", async (req, res) => {
  const { guess, attempt, skipped } = req.body as {
    guess?: string;
    attempt?: number;
    skipped?: boolean;
  };
  const puzzle = await getDaily();
  const attemptIndex = Number(attempt ?? 0);
  const correct = !skipped && typeof guess === "string" && matchesTitle(guess, puzzle.round.track);
  const done = correct || attemptIndex + 1 >= DAILY_MAX_ATTEMPTS;
  res.json({
    correct,
    done,
    solution: done ? solutionOf(puzzle.round) : null,
  });
});

async function poolFor(categoryId: string): Promise<Track[]> {
  const pool = await getCategoryTracks(categoryId);
  return pool.length >= 4 ? pool : getCategoryTracks("pop-global");
}

api.post("/round", async (req, res) => {
  const { categoryId, exclude } = req.body as { categoryId?: string; exclude?: number[] };
  const pool = await poolFor(categoryId ?? "pop-global");
  if (pool.length < 4) {
    res.status(503).json({ error: "catalog_unavailable" });
    return;
  }
  const used = new Set(exclude ?? []);
  const available = pool.filter((t) => !used.has(t.trackId));
  const answer = shuffle(available.length >= 4 ? available : pool)[0];
  const round = createRound(answer, pool);
  res.json({ ...publicRound(round), trackId: answer.trackId });
});

api.post("/year/round", async (req, res) => {
  const { categoryId, exclude } = req.body as { categoryId?: string; exclude?: number[] };
  const pool = (await poolFor(categoryId ?? "pop-global")).filter((t) => t.year !== null);
  if (pool.length < 4) {
    res.status(503).json({ error: "catalog_unavailable" });
    return;
  }
  const used = new Set(exclude ?? []);
  const available = pool.filter((t) => !used.has(t.trackId));
  const answer = shuffle(available.length ? available : pool)[0];
  const round = createYearRound(answer);
  res.json({ ...publicRound(round), trackId: answer.trackId });
});

api.post("/timeline/round", async (req, res) => {
  const { categoryId, exclude } = req.body as { categoryId?: string; exclude?: number[] };
  const pool = (await poolFor(categoryId ?? "pop-global")).filter((t) => t.year !== null);
  if (pool.length < 4) {
    res.status(503).json({ error: "catalog_unavailable" });
    return;
  }
  const used = new Set(exclude ?? []);
  const available = pool.filter((t) => !used.has(t.trackId));
  const answer = shuffle(available.length ? available : pool)[0];
  const round = createRound(answer, pool, false);
  res.json({ ...publicRound(round), trackId: answer.trackId });
});

api.post("/timeline/guess", (req, res) => {
  const { roundId, after, before } = req.body as {
    roundId?: string;
    after?: number | null;
    before?: number | null;
  };
  const round = roundId ? getRound(roundId) : undefined;
  if (!round) {
    res.status(404).json({ error: "round_not_found" });
    return;
  }
  const year = round.track.year ?? 0;
  const correct = year > (after ?? -Infinity) && year <= (before ?? Infinity);
  res.json({ correct, solution: solutionOf(round) });
});

api.post("/impostor/round", async (req, res) => {
  const { categoryId } = req.body as { categoryId?: string };
  const pool = await poolFor(categoryId ?? "pop-global");
  const group = createImpostorGroup(pool);
  if (!group) {
    res.status(503).json({ error: "catalog_unavailable" });
    return;
  }
  res.json(publicImpostor(group));
});

api.post("/impostor/guess", (req, res) => {
  const { groupId, clipId } = req.body as { groupId?: string; clipId?: string };
  const result = groupId ? solveImpostor(groupId, String(clipId ?? "")) : null;
  if (!result) {
    res.status(404).json({ error: "round_not_found" });
    return;
  }
  res.json(result);
});

api.post("/chain/round", async (req, res) => {
  const { artist, exclude } = req.body as { artist?: string; exclude?: number[] };
  const seed = (artist ?? "").trim();
  if (!seed) {
    res.status(400).json({ error: "artist_required" });
    return;
  }
  const used = new Set(exclude ?? []);
  const collab = await findCollab(seed, used);
  if (!collab) {
    res.status(404).json({ error: "chain_dead_end" });
    return;
  }
  const partner = partnerOf(collab);
  const pool = await getArtistTracks(seed, 20);
  const round = createRound(collab, pool.length >= 4 ? pool : await poolFor("pop-global"));
  if (partner) rememberChainPartner(round.id, partner);
  res.json({ ...publicRound(round), trackId: collab.trackId, from: seed });
});

api.post("/chain/guess", (req, res) => {
  const { roundId, optionId } = req.body as { roundId?: string; optionId?: string };
  const round = roundId ? getRound(roundId) : undefined;
  if (!round) {
    res.status(404).json({ error: "round_not_found" });
    return;
  }
  res.json({
    correct: optionId === round.correctOptionId,
    solution: solutionOf(round),
    nextArtist: chainPartner(round.id),
  });
});

api.post("/artist/round", async (req, res) => {
  const { artist, exclude } = req.body as { artist?: string; exclude?: number[] };
  if (!artist) {
    res.status(400).json({ error: "artist_required" });
    return;
  }
  const pool = await getArtistTracks(artist, 20);
  if (pool.length < 4) {
    res.status(404).json({ error: "artist_not_found" });
    return;
  }
  const used = new Set(exclude ?? []);
  const available = pool.filter((t) => !used.has(t.trackId));
  const answer = shuffle(available.length ? available : pool)[0];
  const round = createRound(answer, pool);
  res.json({ ...publicRound(round), trackId: answer.trackId, total: pool.length });
});

api.get("/artist/suggest", async (req, res) => {
  const term = String(req.query.q ?? "").trim();
  if (term.length < 2) {
    res.json({ artists: [] });
    return;
  }
  const tracks = await searchTracks(term, 25);
  const artists = [...new Set(tracks.map((t) => t.artist))].slice(0, 8);
  res.json({ artists });
});

api.get("/leaderboard", async (req, res) => {
  const mode = String(req.query.mode ?? "rush").slice(0, 32);
  const categoryId = String(req.query.categoryId ?? "all").slice(0, 64);
  res.json({ week: weekKey(), top: await topScores(mode, categoryId) });
});

api.post("/leaderboard", async (req, res) => {
  const { mode, categoryId, name, score } = req.body as {
    mode?: string;
    categoryId?: string;
    name?: string;
    score?: number;
  };
  const points = Number(score);
  if (!Number.isFinite(points) || points < 0) {
    res.status(400).json({ error: "invalid_score" });
    return;
  }
  const result = await submitScore(
    String(mode ?? "rush").slice(0, 32),
    String(categoryId ?? "all").slice(0, 64),
    String(name ?? "").trim(),
    Math.min(Math.round(points), 1_000_000),
  );
  res.json({ week: weekKey(), ...result });
});

const SOLO_MODES = new Set(["diario", "rush", "artista", "anio", "linea", "impostor", "cadena"]);

api.post("/games", (req, res) => {
  const { mode, categoryId, score } = req.body as { mode?: string; categoryId?: string; score?: number };
  if (!mode || !SOLO_MODES.has(mode)) {
    res.status(400).json({ error: "invalid_mode" });
    return;
  }
  const points = Number(score);
  recordGame({
    mode,
    categoryId: categoryId ? String(categoryId) : null,
    score: Number.isFinite(points) ? points : null,
  });
  res.json({ ok: true });
});

api.get("/stats", async (_req, res) => {
  try {
    const stats = await gameStats();
    if (!stats) {
      res.status(503).json({ error: "stats_disabled" });
      return;
    }
    res.json(stats);
  } catch (err) {
    console.error("stats", err);
    res.status(502).json({ error: "stats_unavailable" });
  }
});

api.post("/answer", (req, res) => {
  const { roundId, optionId } = req.body as { roundId?: string; optionId?: string };
  const round = roundId ? getRound(roundId) : undefined;
  if (!round) {
    res.status(404).json({ error: "round_not_found" });
    return;
  }
  res.json({ correct: optionId === round.correctOptionId, solution: solutionOf(round) });
});
