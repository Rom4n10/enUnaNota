import { getCategory } from "./catalog.js";

export type Track = {
  trackId: number;
  title: string;
  artist: string;
  artwork: string;
  previewUrl: string;
  genre: string;
  year: number | null;
};

type RawTrack = {
  trackId?: number;
  trackName?: string;
  artistName?: string;
  artworkUrl100?: string;
  previewUrl?: string;
  primaryGenreName?: string;
  releaseDate?: string;
  kind?: string;
};

const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const cache = new Map<string, { at: number; tracks: Track[] }>();
const inflight = new Map<string, Promise<Track[]>>();

function normalize(raw: RawTrack): Track | null {
  if (raw.kind !== "song" || !raw.previewUrl || !raw.trackName || !raw.artistName || !raw.trackId) {
    return null;
  }
  return {
    trackId: raw.trackId,
    title: raw.trackName,
    artist: raw.artistName,
    artwork: (raw.artworkUrl100 ?? "").replace("100x100", "400x400"),
    previewUrl: raw.previewUrl,
    genre: raw.primaryGenreName ?? "",
    year: raw.releaseDate ? Number(raw.releaseDate.slice(0, 4)) : null,
  };
}

/** Removes remixes/live/karaoke versions and duplicated titles by the same artist. */
function dedupe(tracks: Track[]): Track[] {
  const noise = /(karaoke|tribute|instrumental|made popular|cover version|originally performed)/i;
  const seen = new Set<string>();
  const out: Track[] = [];
  for (const t of tracks) {
    if (noise.test(t.title) || noise.test(t.artist)) continue;
    const key = `${t.artist.toLowerCase()}::${t.title.toLowerCase().replace(/\s*[([].*$/, "").trim()}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export async function searchTracks(term: string, limit = 20, country = "AR"): Promise<Track[]> {
  const key = `${country}|${term.toLowerCase()}|${limit}`;
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < CACHE_TTL_MS) return hit.tracks;
  const pending = inflight.get(key);
  if (pending) return pending;

  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
    `&media=music&entity=song&limit=${limit}&country=${country}`;

  const task = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (!res.ok) throw new Error(`iTunes ${res.status}`);
      const body = (await res.json()) as { results?: RawTrack[] };
      const tracks = dedupe((body.results ?? []).map(normalize).filter((t): t is Track => t !== null));
      cache.set(key, { at: Date.now(), tracks });
      return tracks;
    } catch (err) {
      console.error(`[itunes] search failed for "${term}":`, (err as Error).message);
      return hit?.tracks ?? [];
    } finally {
      inflight.delete(key);
    }
  })();

  inflight.set(key, task);
  return task;
}

export async function getArtistTracks(artist: string, limit = 12): Promise<Track[]> {
  const tracks = await searchTracks(artist, limit + 10);
  const target = artist.toLowerCase().replace(/[^a-z0-9]/g, "");
  const exact = tracks.filter((t) => t.artist.toLowerCase().replace(/[^a-z0-9]/g, "").includes(target));
  return (exact.length >= 4 ? exact : tracks).slice(0, limit);
}

export async function getCategoryTracks(categoryId: string): Promise<Track[]> {
  const category = getCategory(categoryId);
  if (!category) return [];
  const lists = await Promise.all(category.artists.map((a) => getArtistTracks(a, 8)));
  return dedupe(lists.flat());
}
