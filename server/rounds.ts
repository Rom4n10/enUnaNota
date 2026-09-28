import { randomUUID } from "node:crypto";
import type { Track } from "./itunes.js";

export type Option = { id: string; label: string };

export type Round = {
  id: string;
  track: Track;
  options: Option[];
  correctOptionId: string;
  createdAt: number;
};

export type Solution = {
  title: string;
  artist: string;
  artwork: string;
  correctOptionId: string;
};

const TTL_MS = 60 * 60 * 1000;
const rounds = new Map<string, Round>();

setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, round] of rounds) if (round.createdAt < cutoff) rounds.delete(id);
}, 5 * 60 * 1000).unref();

export function shuffle<T>(items: T[], rand: () => number = Math.random): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Picks three believable decoys: same genre first, then same pool, never the
 * same title and never more than one track per artist.
 */
export function pickDecoys(answer: Track, pool: Track[], count = 3): Track[] {
  const usedArtists = new Set([answer.artist.toLowerCase()]);
  const usedTitles = new Set([answer.title.toLowerCase()]);
  const eligible = pool.filter(
    (t) => t.trackId !== answer.trackId && !usedTitles.has(t.title.toLowerCase()),
  );
  const sameGenre = shuffle(eligible.filter((t) => t.genre && t.genre === answer.genre));
  const rest = shuffle(eligible.filter((t) => t.genre !== answer.genre));

  const decoys: Track[] = [];
  for (const candidate of [...sameGenre, ...rest]) {
    if (decoys.length === count) break;
    const artist = candidate.artist.toLowerCase();
    const title = candidate.title.toLowerCase();
    if (usedArtists.has(artist) || usedTitles.has(title)) continue;
    usedArtists.add(artist);
    usedTitles.add(title);
    decoys.push(candidate);
  }
  return decoys;
}

export function label(track: Track): string {
  return `${track.title} — ${track.artist}`;
}

export function createRound(answer: Track, pool: Track[], withOptions = true): Round {
  const id = randomUUID();
  let options: Option[] = [];
  let correctOptionId = "";
  if (withOptions) {
    const decoys = pickDecoys(answer, pool);
    const entries = shuffle([
      { id: randomUUID(), label: label(answer), correct: true },
      ...decoys.map((d) => ({ id: randomUUID(), label: label(d), correct: false })),
    ]);
    options = entries.map(({ id: optionId, label: text }) => ({ id: optionId, label: text }));
    correctOptionId = entries.find((e) => e.correct)!.id;
  }
  const round: Round = { id, track: answer, options, correctOptionId, createdAt: Date.now() };
  rounds.set(id, round);
  return round;
}

export function getRound(id: string): Round | undefined {
  return rounds.get(id);
}

export function solutionOf(round: Round): Solution {
  return {
    title: round.track.title,
    artist: round.track.artist,
    artwork: round.track.artwork,
    correctOptionId: round.correctOptionId,
  };
}

/** Shape sent to the client: never includes title, artist or the preview URL. */
export function publicRound(round: Round) {
  return {
    roundId: round.id,
    audioUrl: `/api/audio/${round.id}`,
    options: round.options,
  };
}

/** Lenient comparison for free-text guesses in the daily mode. */
export function matchesTitle(guess: string, track: Track): boolean {
  const clean = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/\s*[([][^)\]]*[)\]]/g, "")
      .replace(/[^a-z0-9\s]/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const g = clean(guess);
  if (!g) return false;
  const title = clean(track.title);
  return g === title || g === clean(`${track.title} ${track.artist}`);
}
