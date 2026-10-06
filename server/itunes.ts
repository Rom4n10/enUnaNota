import { getCategory } from "./catalog.js";
import { dbEnabled, select, upsertQuiet } from "./db.js";

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

/**
 * Apple documents roughly 20 Search API calls per minute per IP, and every search
 * comes from this server. Results are cached in memory and in Supabase (so deploys
 * start warm), and live calls go through a token bucket with retries.
 */
const FRESH_MS = 24 * 60 * 60 * 1000;
const RATE_PER_MIN = 20;
const MAX_QUEUE_WAIT_MS = 25_000;
const MAX_ATTEMPTS = 3;
const STALE_RETRY_MS = 2 * 60 * 1000;
const STORE_TABLE = "itunes_cache";

type Cached = { at: number; tracks: Track[] };
type StoredRow = { tracks: Track[]; fetched_at: string };

const cache = new Map<string, Cached>();
const inflight = new Map<string, Promise<Track[]>>();

class RateLimited extends Error {}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

let tokens = RATE_PER_MIN;
let refilledAt = Date.now();
let pausedUntil = 0;
let queue: Promise<void> = Promise.resolve();

function refill(): void {
  const now = Date.now();
  tokens = Math.min(RATE_PER_MIN, tokens + ((now - refilledAt) * RATE_PER_MIN) / 60_000);
  refilledAt = now;
}

/** Resolves when a call may go out; rejects if that would take longer than `MAX_QUEUE_WAIT_MS`. */
function takeToken(): Promise<void> {
  const deadline = Date.now() + MAX_QUEUE_WAIT_MS;
  const turn = queue.then(async () => {
    for (;;) {
      refill();
      const tokenWait = tokens >= 1 ? 0 : ((1 - tokens) * 60_000) / RATE_PER_MIN;
      const wait = Math.max(tokenWait, pausedUntil - Date.now());
      if (wait <= 0) {
        tokens -= 1;
        return;
      }
      if (Date.now() + wait > deadline) throw new RateLimited("itunes queue full");
      await sleep(wait);
    }
  });
  queue = turn.catch(() => undefined);
  return turn;
}

async function fetchSearch(url: string): Promise<RawTrack[]> {
  for (let attempt = 1; ; attempt++) {
    await takeToken();
    let res: Response;
    try {
      res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    } catch (err) {
      if (attempt >= MAX_ATTEMPTS) throw err;
      await sleep(1000 * attempt);
      continue;
    }
    if (res.ok) {
      const body = (await res.json()) as { results?: RawTrack[] };
      return body.results ?? [];
    }
    // Apple answers 403/429 when throttling: pause every pending call before retrying.
    const throttled = res.status === 403 || res.status === 429;
    if (attempt >= MAX_ATTEMPTS || (!throttled && res.status < 500)) throw new Error(`iTunes ${res.status}`);
    if (throttled) pausedUntil = Math.max(pausedUntil, Date.now() + 10_000 * attempt);
    else await sleep(1000 * attempt);
  }
}

let storeWarned = false;
function warnStore(err: unknown): void {
  if (storeWarned) return;
  storeWarned = true;
  console.error("[itunes] search cache in Supabase unavailable:", (err as Error).message);
}

async function loadStored(key: string): Promise<Cached | null> {
  if (!dbEnabled) return null;
  try {
    const rows = await select<StoredRow>(
      STORE_TABLE,
      new URLSearchParams({ key: `eq.${key}`, select: "tracks,fetched_at" }),
    );
    return rows[0] ? { at: Date.parse(rows[0].fetched_at), tracks: rows[0].tracks } : null;
  } catch (err) {
    warnStore(err);
    return null;
  }
}

function saveStored(key: string, entry: Cached): void {
  if (!dbEnabled) return;
  upsertQuiet(
    STORE_TABLE,
    { key, tracks: entry.tracks, fetched_at: new Date(entry.at).toISOString() },
    "key",
  ).catch(warnStore);
}

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
  if (hit && Date.now() - hit.at < FRESH_MS) return hit.tracks;
  const pending = inflight.get(key);
  if (pending) return pending;

  const url =
    `https://itunes.apple.com/search?term=${encodeURIComponent(term)}` +
    `&media=music&entity=song&limit=${limit}&country=${country}`;

  const task = (async () => {
    const stored = hit ?? (await loadStored(key));
    try {
      if (stored && Date.now() - stored.at < FRESH_MS) {
        cache.set(key, stored);
        return stored.tracks;
      }
      const raw = await fetchSearch(url);
      const entry = { at: Date.now(), tracks: dedupe(raw.map(normalize).filter((t): t is Track => t !== null)) };
      cache.set(key, entry);
      saveStored(key, entry);
      return entry.tracks;
    } catch (err) {
      console.error(`[itunes] search failed for "${term}":`, (err as Error).message);
      if (stored) cache.set(key, { at: Date.now() - FRESH_MS + STALE_RETRY_MS, tracks: stored.tracks });
      return stored?.tracks ?? [];
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
  const lists = await Promise.all([
    ...category.artists.map((a) => getArtistTracks(a, 8)),
    ...category.terms.map((t) => searchTracks(t, 25)),
  ]);
  return dedupe(lists.flat());
}
