export type Option = { id: string; label: string };

export type Solution = {
  title: string;
  artist: string;
  artwork: string;
  year: number | null;
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

export type ArtistBoard = { artist: string; plays: number; leader: ScoreEntry };

export type ChaosType = "none" | "double" | "short";

export type RoomMode = "classic" | "buzzer" | "auction";

export type RoomPlayer = { id: string; name: string; score: number; connected: boolean };

export type RoomState = {
  code: string;
  hostId: string;
  categoryId: string;
  mode: RoomMode;
  totalRounds: number;
  chaosEnabled: boolean;
  status: "lobby" | "playing" | "reveal" | "finished";
  roundIndex: number;
  players: RoomPlayer[];
  rematchVotes: string[];
  serverTime: number;
};

export type RoundStart = RoundPayload & {
  roundIndex: number;
  totalRounds: number;
  startAt: number;
  answerWindowMs: number;
  chaos: ChaosType;
  mode: RoomMode;
  buzzAnswerMs: number;
  clipMs?: number;
  auctionWinnerId?: string;
  bidSeconds?: number;
  serverTime: number;
};

export type AuctionStart = {
  roundIndex: number;
  totalRounds: number;
  hint: string;
  minBid: number;
  maxBid: number;
  deadline: number;
  serverTime: number;
};

export type AuctionResult = { playerId: string | null; name: string | null; seconds: number | null };

export type BidPlaced = { playerId: string; name: string; seconds: number };

export type BuzzLock = { playerId: string; name: string; deadline: number; serverTime: number };

export type BuzzResume = {
  playerId: string;
  name: string;
  reason: "wrong" | "timeout";
  resumeAt: number;
  offsetMs: number;
  blocked: string[];
  serverTime: number;
};

export type Reaction = { id: string; name: string; emoji: string };

export type ImpostorRound = {
  groupId: string;
  artist: string;
  clips: { clipId: string; audioUrl: string }[];
};

export type ImpostorResult = {
  correct: boolean;
  clips: { clipId: string; title: string; artist: string; artwork: string; impostor: boolean }[];
};

export type ChainRound = RoundPayload & { from: string };

export type ChainGuess = { correct: boolean; solution: Solution; nextArtist: string | null };

export type RoundEnd = {
  solution: Solution;
  results: { id: string; name: string; correct: boolean; points: number; ms: number | null }[];
  leaderboard: RoomPlayer[];
  isLastRound: boolean;
};
