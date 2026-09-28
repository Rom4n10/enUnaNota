import type { Request, Response } from "express";
import { getPreview } from "./previewCache.js";
import { getRound } from "./rounds.js";

function parseRange(header: string | undefined, size: number): { start: number; end: number } | null {
  if (!header) return null;
  const match = /^bytes=(\d*)-(\d*)$/.exec(header.trim());
  if (!match) return null;
  const [, rawStart, rawEnd] = match;
  let start = rawStart ? Number(rawStart) : 0;
  let end = rawEnd ? Number(rawEnd) : size - 1;
  if (!rawStart && rawEnd) {
    start = Math.max(0, size - Number(rawEnd));
    end = size - 1;
  }
  if (Number.isNaN(start) || Number.isNaN(end) || start > end || start >= size) return null;
  return { start, end: Math.min(end, size - 1) };
}

/**
 * Streams the iTunes preview through the server so the client never learns the
 * original file name or any metadata from the network tab.
 */
export async function streamAudio(req: Request, res: Response): Promise<void> {
  const round = getRound(String(req.params.roundId));
  if (!round) {
    res.status(404).json({ error: "round_not_found" });
    return;
  }

  const preview = await getPreview(round.track.previewUrl);
  if (!preview) {
    res.status(502).json({ error: "upstream_unavailable" });
    return;
  }

  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");

  const range = parseRange(req.headers.range, preview.body.length);
  if (range) {
    res.status(206);
    res.setHeader("Content-Range", `bytes ${range.start}-${range.end}/${preview.body.length}`);
    res.setHeader("Content-Length", range.end - range.start + 1);
    res.end(preview.body.subarray(range.start, range.end + 1));
    return;
  }

  res.status(200);
  res.setHeader("Content-Length", preview.body.length);
  res.end(preview.body);
}
