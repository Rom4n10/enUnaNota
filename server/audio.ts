import type { Request, Response } from "express";
import { Readable } from "node:stream";
import { getRound } from "./rounds.js";

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

  const range = req.headers.range;
  const upstream = await fetch(round.track.previewUrl, {
    headers: range ? { Range: range } : undefined,
    signal: AbortSignal.timeout(15_000),
  });

  if (!upstream.ok || !upstream.body) {
    res.status(502).json({ error: "upstream_unavailable" });
    return;
  }

  res.status(upstream.status);
  res.setHeader("Content-Type", "audio/mp4");
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Cache-Control", "no-store");
  for (const header of ["content-length", "content-range"]) {
    const value = upstream.headers.get(header);
    if (value) res.setHeader(header, value);
  }

  const stream = Readable.fromWeb(upstream.body as Parameters<typeof Readable.fromWeb>[0]);
  stream.on("error", () => res.destroy());
  req.on("close", () => stream.destroy());
  stream.pipe(res);
}
