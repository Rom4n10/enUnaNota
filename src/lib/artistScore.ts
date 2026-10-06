export const ARTIST_ROUNDS = 10;

/** Hits weigh 100 each; the remainder (0-99) rewards faster answers and breaks ties. */
export function artistScore(hits: number, avgAnswerMs: number): number {
  const bonus = Math.max(0, Math.min(99, 99 - Math.round(avgAnswerMs / 200)));
  return hits * 100 + bonus;
}

export const formatArtistScore = (score: number) => `${Math.floor(score / 100)}/${ARTIST_ROUNDS}`;
