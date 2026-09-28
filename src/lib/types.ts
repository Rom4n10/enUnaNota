export type Option = { id: string; label: string };

export type Solution = {
  title: string;
  artist: string;
  artwork: string;
  correctOptionId: string;
};

export type RoundPayload = {
  roundId: string;
  audioUrl: string;
  options: Option[];
  trackId?: number;
};

export type Category = { id: string; name: string; emoji: string };

export type DailyPayload = RoundPayload & {
  date: string;
  steps: number[];
  maxAttempts: number;
  choices: string[];
  nextPuzzleInMs: number;
};

export type ScoreEntry = { name: string; score: number; at: number };

export type ChaosType = "none" | "double" | "short";

export type RoomPlayer = { id: string; name: string; score: number; connected: boolean };

export type RoomState = {
  code: string;
  hostId: string;
  categoryId: string;
  totalRounds: number;
  chaosEnabled: boolean;
  status: "lobby" | "playing" | "reveal" | "finished";
  roundIndex: number;
  players: RoomPlayer[];
  serverTime: number;
};

export type RoundStart = RoundPayload & {
  roundIndex: number;
  totalRounds: number;
  startAt: number;
  answerWindowMs: number;
  chaos: ChaosType;
  serverTime: number;
};

export type RoundEnd = {
  solution: Solution;
  results: { id: string; name: string; correct: boolean; points: number; ms: number | null }[];
  leaderboard: RoomPlayer[];
  isLastRound: boolean;
};
