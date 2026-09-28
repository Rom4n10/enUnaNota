/**
 * Keeps iTunes previews in memory so a round never waits for Apple's CDN twice.
 * Rounds warm their own clip as soon as they are created, which is what makes
 * playback feel instant even on the first listen.
 */
const MAX_ENTRIES = 400;

type Entry = { body: Buffer; contentType: string };

const cache = new Map<string, Entry>();
const inflight = new Map<string, Promise<Entry | null>>();

function touch(url: string, entry: Entry): void {
  cache.delete(url);
  cache.set(url, entry);
  while (cache.size > MAX_ENTRIES) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

export async function getPreview(url: string): Promise<Entry | null> {
  const hit = cache.get(url);
  if (hit) {
    touch(url, hit);
    return hit;
  }
  const pending = inflight.get(url);
  if (pending) return pending;

  const task = (async () => {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
      if (!res.ok) return null;
      const entry: Entry = {
        body: Buffer.from(await res.arrayBuffer()),
        contentType: res.headers.get("content-type") ?? "audio/mp4",
      };
      touch(url, entry);
      return entry;
    } catch {
      return null;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, task);
  return task;
}

/** Fire-and-forget warm-up; failures are irrelevant because playback retries. */
export function warmPreview(url: string): void {
  if (cache.has(url) || inflight.has(url)) return;
  void getPreview(url);
}
