import { randomUUID } from "node:crypto";
import { getArtistTracks, searchTracks, type Track } from "./itunes.js";
import { createRound, shuffle } from "./rounds.js";

const TTL_MS = 60 * 60 * 1000;

type ImpostorGroup = {
  id: string;
  clips: { clipId: string; track: Track; impostor: boolean }[];
  artist: string;
  createdAt: number;
};

const impostors = new Map<string, ImpostorGroup>();
const chainNext = new Map<string, { artist: string; createdAt: number }>();

setInterval(() => {
  const cutoff = Date.now() - TTL_MS;
  for (const [id, g] of impostors) if (g.createdAt < cutoff) impostors.delete(id);
  for (const [id, c] of chainNext) if (c.createdAt < cutoff) chainNext.delete(id);
}, 5 * 60 * 1000).unref();

/** Two clips from the same artist plus one lookalike from a different one. */
export function createImpostorGroup(pool: Track[]): ImpostorGroup | null {
  const byArtist = new Map<string, Track[]>();
  for (const track of pool) {
    const key = track.artist.toLowerCase();
    byArtist.set(key, [...(byArtist.get(key) ?? []), track]);
  }
  const candidates = shuffle([...byArtist.values()].filter((list) => list.length >= 2));
  if (!candidates.length) return null;

  const family = shuffle(candidates[0]).slice(0, 2);
  const artist = family[0].artist;
  const sameGenre = pool.filter(
    (t) => t.artist !== artist && (!family[0].genre || t.genre === family[0].genre),
  );
  const outsiders = shuffle(sameGenre.length ? sameGenre : pool.filter((t) => t.artist !== artist));
  if (!outsiders.length) return null;

  const clips = shuffle([
    ...family.map((track) => ({ clipId: "", track, impostor: false })),
    { clipId: "", track: outsiders[0], impostor: true },
  ]).map((clip) => ({ ...clip, clipId: createRound(clip.track, [], false).id }));

  const group: ImpostorGroup = { id: randomUUID(), clips, artist, createdAt: Date.now() };
  impostors.set(group.id, group);
  return group;
}

export function publicImpostor(group: ImpostorGroup) {
  return {
    groupId: group.id,
    artist: group.artist,
    clips: group.clips.map((c) => ({ clipId: c.clipId, audioUrl: `/api/audio/${c.clipId}` })),
  };
}

export function solveImpostor(groupId: string, clipId: string) {
  const group = impostors.get(groupId);
  if (!group) return null;
  const chosen = group.clips.find((c) => c.clipId === clipId);
  return {
    correct: Boolean(chosen?.impostor),
    clips: group.clips.map((c) => ({
      clipId: c.clipId,
      title: c.track.title,
      artist: c.track.artist,
      artwork: c.track.artwork,
      impostor: c.impostor,
    })),
  };
}

const COLLAB = /\b(feat\.?|ft\.?|with|con)\b|&|\bx\b/i;

/** Extracts the featured artist from "Tema (feat. X)" or "A & B" style credits. */
export function partnerOf(track: Track): string | null {
  const fromTitle = track.title.match(/\((?:feat\.?|ft\.?|con|with)\s+([^)]+)\)/i);
  if (fromTitle) return fromTitle[1].trim();
  const fromArtist = track.artist.split(/\s*(?:&|feat\.?|ft\.?|con|x|,)\s*/i);
  if (fromArtist.length > 1) return fromArtist[fromArtist.length - 1].trim();
  return null;
}

/** Finds a track where `artist` collaborates with someone else. */
export async function findCollab(artist: string, exclude: Set<number>): Promise<Track | null> {
  const lists = await Promise.all([
    searchTracks(`${artist} feat`, 25),
    searchTracks(`${artist} ft`, 25),
    getArtistTracks(artist, 25),
  ]);
  const needle = artist.toLowerCase().replace(/[^a-z0-9]/g, "");
  const candidates = shuffle(lists.flat()).filter((t) => {
    if (exclude.has(t.trackId)) return false;
    const credits = `${t.artist} ${t.title}`.toLowerCase();
    if (!credits.replace(/[^a-z0-9]/g, "").includes(needle)) return false;
    if (!COLLAB.test(`${t.artist} ${t.title}`)) return false;
    const partner = partnerOf(t);
    return Boolean(partner && partner.toLowerCase().replace(/[^a-z0-9]/g, "") !== needle);
  });
  return candidates[0] ?? null;
}

export function rememberChainPartner(roundId: string, artist: string) {
  chainNext.set(roundId, { artist, createdAt: Date.now() });
}

export function chainPartner(roundId: string): string | null {
  return chainNext.get(roundId)?.artist ?? null;
}
