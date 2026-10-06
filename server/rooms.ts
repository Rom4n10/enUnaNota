import type { Server, Socket } from "socket.io";
import { recordGame } from "./games.js";
import { getCategoryTracks, type Track } from "./itunes.js";
import { warmPreview } from "./previewCache.js";
import { createRound, publicRound, shuffle, solutionOf, type Round } from "./rounds.js";

const CODE_ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
const START_DELAY_MS = 1500;
const ANSWER_WINDOW_MS = 15_000;
const BUZZER_WINDOW_MS = 29_000;
const BUZZ_ANSWER_MS = 8000;
const RESUME_DELAY_MS = 1200;
const REVEAL_MS = 5000;
const MAX_PLAYERS = 12;
const BIDDING_MS = 12_000;
const BID_MIN = 1;
const BID_MAX = 6;

export type ChaosType = "none" | "double" | "short";
export type RoomMode = "classic" | "buzzer" | "auction";

type Player = {
  id: string;
  name: string;
  score: number;
  connected: boolean;
  answer: { optionId: string; ms: number; correct: boolean; points: number } | null;
};

type Buzz = { playerId: string; name: string; deadline: number };

type ActiveRound = Round & {
  startAt: number;
  chaos: ChaosType;
  mode: RoomMode;
  /** Milliseconds of audio already played, accumulated across buzz pauses. */
  playedMs: number;
  playingSince: number | null;
  buzz: Buzz | null;
  blocked: Set<string>;
  /** Auction mode: who won the bid and how many seconds of audio they bought. */
  auctionWinnerId: string | null;
  bidSeconds: number | null;
};

type Room = {
  code: string;
  hostId: string;
  categoryId: string;
  mode: RoomMode;
  totalRounds: number;
  chaosEnabled: boolean;
  status: "lobby" | "playing" | "reveal" | "finished";
  roundIndex: number;
  players: Map<string, Player>;
  pool: Track[];
  used: Set<number>;
  round: ActiveRound | null;
  bids: Map<string, number>;
  rematch: Set<string>;
  timers: NodeJS.Timeout[];
};

const rooms = new Map<string, Room>();

function newCode(): string {
  let code = "";
  do {
    code = Array.from({ length: 4 }, () => CODE_ALPHABET[Math.floor(Math.random() * CODE_ALPHABET.length)]).join("");
  } while (rooms.has(code));
  return code;
}

/** Downloads a handful of previews up front so synced playback never stalls. */
function warmPool(pool: Track[], count = 14): void {
  shuffle(pool).slice(0, count).forEach((t) => warmPreview(t.previewUrl));
}

function clearTimers(room: Room) {
  room.timers.forEach(clearTimeout);
  room.timers = [];
}

function scoreboard(room: Room) {
  return [...room.players.values()]
    .map((p) => ({ id: p.id, name: p.name, score: p.score, connected: p.connected }))
    .sort((a, b) => b.score - a.score);
}

function roomState(room: Room) {
  return {
    code: room.code,
    hostId: room.hostId,
    categoryId: room.categoryId,
    mode: room.mode,
    totalRounds: room.totalRounds,
    chaosEnabled: room.chaosEnabled,
    status: room.status,
    roundIndex: room.roundIndex,
    players: scoreboard(room),
    rematchVotes: [...room.rematch],
    serverTime: Date.now(),
  };
}

/** Text clue for the auction: enough to bluff with, never enough to answer. */
function hintFor(track: Track): string {
  const decade = track.year ? `de los ${Math.floor(track.year / 10) * 10}` : "de época incierta";
  const genre = track.genre || "Un tema";
  return `${genre} ${decade} · el artista empieza con "${track.artist.slice(0, 1).toUpperCase()}"`;
}

function pointsFor(elapsedMs: number, chaos: ChaosType): number {
  const clamped = Math.max(0, Math.min(elapsedMs, ANSWER_WINDOW_MS));
  const base = Math.round(1000 - (clamped / ANSWER_WINDOW_MS) * 800);
  return chaos === "double" ? base * 2 : base;
}

export function registerRooms(io: Server) {
  const emitState = (room: Room) => io.to(room.code).emit("room_state", roomState(room));

  const windowOf = (room: Room) => (room.mode === "buzzer" ? BUZZER_WINDOW_MS : ANSWER_WINDOW_MS);

  function startGame(room: Room) {
    room.roundIndex = 0;
    room.used.clear();
    room.rematch.clear();
    room.players.forEach((p) => {
      p.score = 0;
      p.answer = null;
    });
    void startRound(room);
  }

  function scheduleEnd(room: Room, ms: number) {
    room.timers.push(setTimeout(() => endRound(room), Math.max(0, ms)));
  }

  async function startRound(room: Room) {
    clearTimers(room);
    if (room.roundIndex >= room.totalRounds) {
      room.status = "finished";
      room.round = null;
      emitState(room);
      io.to(room.code).emit("game_over", { leaderboard: scoreboard(room) });
      recordGame({ mode: `sala-${room.mode}`, categoryId: room.categoryId, players: room.players.size });
      return;
    }

    if (room.pool.length < 4) {
      room.pool = await getCategoryTracks(room.categoryId);
      warmPool(room.pool);
    }
    if (room.pool.length < 4) {
      io.to(room.code).emit("error_msg", { message: "No pudimos cargar canciones de esa categoría." });
      room.status = "lobby";
      emitState(room);
      return;
    }

    const available = room.pool.filter((t) => !room.used.has(t.trackId));
    const answer = shuffle(available.length >= 4 ? available : room.pool)[0];
    room.used.add(answer.trackId);

    const chaos: ChaosType = room.mode === "classic" && room.chaosEnabled && Math.random() < 0.25
      ? (Math.random() < 0.5 ? "double" : "short")
      : "none";
    const base = createRound(answer, room.pool);
    const startAt = Date.now() + START_DELAY_MS;
    room.round = {
      ...base,
      startAt,
      chaos,
      mode: room.mode,
      playedMs: 0,
      playingSince: startAt,
      buzz: null,
      blocked: new Set(),
      auctionWinnerId: null,
      bidSeconds: null,
    };
    room.status = "playing";
    room.players.forEach((p) => (p.answer = null));

    if (room.mode === "auction") {
      room.bids.clear();
      const deadline = Date.now() + BIDDING_MS;
      io.to(room.code).emit("auction_start", {
        roundIndex: room.roundIndex,
        totalRounds: room.totalRounds,
        hint: hintFor(answer),
        minBid: BID_MIN,
        maxBid: BID_MAX,
        deadline,
        serverTime: Date.now(),
      });
      emitState(room);
      room.timers.push(setTimeout(() => closeAuction(room), BIDDING_MS));
      return;
    }

    io.to(room.code).emit("round_start", {
      ...publicRound(base),
      roundIndex: room.roundIndex,
      totalRounds: room.totalRounds,
      startAt,
      answerWindowMs: windowOf(room),
      chaos,
      mode: room.mode,
      buzzAnswerMs: BUZZ_ANSWER_MS,
      serverTime: Date.now(),
    });
    emitState(room);

    scheduleEnd(room, START_DELAY_MS + windowOf(room));
  }

  /** Lowest bid wins (earliest bid breaks ties) and only that player hears the clip. */
  function closeAuction(room: Room) {
    const round = room.round;
    if (!round || room.status !== "playing") return;
    clearTimers(room);

    let winner: Player | null = null;
    let best = Number.POSITIVE_INFINITY;
    for (const [playerId, seconds] of room.bids) {
      const player = room.players.get(playerId);
      if (!player || !player.connected || seconds >= best) continue;
      winner = player;
      best = seconds;
    }

    if (!winner) {
      io.to(room.code).emit("auction_result", { playerId: null, name: null, seconds: null });
      endRound(room);
      return;
    }

    round.auctionWinnerId = winner.id;
    round.bidSeconds = best;
    const clipMs = best * 1000;
    const startAt = Date.now() + START_DELAY_MS;
    round.startAt = startAt;
    round.playingSince = startAt;

    io.to(room.code).emit("auction_result", { playerId: winner.id, name: winner.name, seconds: best });
    io.to(room.code).emit("round_start", {
      ...publicRound(round),
      roundIndex: room.roundIndex,
      totalRounds: room.totalRounds,
      startAt,
      answerWindowMs: clipMs + BUZZ_ANSWER_MS,
      chaos: "none" as ChaosType,
      mode: room.mode,
      buzzAnswerMs: BUZZ_ANSWER_MS,
      clipMs,
      auctionWinnerId: winner.id,
      bidSeconds: best,
      serverTime: Date.now(),
    });
    scheduleEnd(room, START_DELAY_MS + clipMs + BUZZ_ANSWER_MS);
  }

  /** Freezes the song for everyone and gives the buzzing player the options. */
  function lockBuzz(room: Room, player: Player) {
    const round = room.round;
    if (!round) return;
    clearTimers(room);
    const now = Date.now();
    if (round.playingSince !== null) {
      round.playedMs += Math.max(0, now - round.playingSince);
      round.playingSince = null;
    }
    round.buzz = { playerId: player.id, name: player.name, deadline: now + BUZZ_ANSWER_MS };
    io.to(room.code).emit("buzz_lock", {
      playerId: player.id,
      name: player.name,
      deadline: round.buzz.deadline,
      serverTime: now,
    });
    room.timers.push(setTimeout(() => missedBuzz(room, player.id), BUZZ_ANSWER_MS));
  }

  /** Wrong answer or timeout: the player sits out the song and music resumes. */
  function releaseBuzz(room: Room, playerId: string, reason: "wrong" | "timeout") {
    const round = room.round;
    if (!round || round.buzz?.playerId !== playerId) return;
    clearTimers(room);
    round.buzz = null;
    round.blocked.add(playerId);
    const name = room.players.get(playerId)?.name ?? "Alguien";

    const alive = [...room.players.values()].filter((p) => p.connected && !round.blocked.has(p.id));
    const remaining = windowOf(room) - round.playedMs;
    if (alive.length === 0 || remaining <= 500) {
      endRound(room);
      return;
    }

    const resumeAt = Date.now() + RESUME_DELAY_MS;
    round.playingSince = resumeAt;
    io.to(room.code).emit("buzz_resume", {
      playerId,
      name,
      reason,
      resumeAt,
      offsetMs: round.playedMs,
      blocked: [...round.blocked],
      serverTime: Date.now(),
    });
    scheduleEnd(room, RESUME_DELAY_MS + remaining);
  }

  function missedBuzz(room: Room, playerId: string) {
    const player = room.players.get(playerId);
    if (player) player.answer = { optionId: "", ms: 0, correct: false, points: 0 };
    releaseBuzz(room, playerId, "timeout");
  }

  function endRound(room: Room) {
    if (!room.round || room.status !== "playing") return;
    clearTimers(room);
    const solution = solutionOf(room.round);
    room.status = "reveal";
    room.roundIndex += 1;
    io.to(room.code).emit("round_end", {
      solution,
      results: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        correct: p.answer?.correct ?? false,
        points: p.answer?.points ?? 0,
        ms: p.answer?.ms ?? null,
      })),
      leaderboard: scoreboard(room),
      isLastRound: room.roundIndex >= room.totalRounds,
    });
    emitState(room);
    room.timers.push(setTimeout(() => void startRound(room), REVEAL_MS));
  }

  io.on("connection", (socket: Socket) => {
    let joined: { code: string } | null = null;

    const findRoom = () => {
      const room = joined ? rooms.get(joined.code) : undefined;
      return room?.players.has(socket.id) ? room : undefined;
    };

    /** A socket belongs to at most one room: leaving cleans up before creating/joining another. */
    const leaveRoom = () => {
      const room = findRoom();
      if (joined) socket.leave(joined.code);
      joined = null;
      if (!room) return;
      const round = room.round;
      if (round?.buzz?.playerId === socket.id) releaseBuzz(room, socket.id, "timeout");
      room.players.delete(socket.id);
      room.rematch.delete(socket.id);
      room.bids.delete(socket.id);
      if (room.players.size === 0) {
        clearTimers(room);
        rooms.delete(room.code);
        return;
      }
      if (room.hostId === socket.id) room.hostId = [...room.players.keys()][0];
      if (room.status === "playing" && round) {
        const winnerLeft = round.mode === "auction" && round.auctionWinnerId === socket.id;
        const allAnswered =
          round.mode === "classic" && [...room.players.values()].every((p) => !p.connected || p.answer);
        if (winnerLeft || allAnswered) endRound(room);
      }
      if (room.status === "finished") {
        const ready = [...room.players.values()].filter((p) => p.connected);
        if (ready.length > 0 && ready.every((p) => room.rematch.has(p.id))) {
          startGame(room);
          return;
        }
      }
      emitState(room);
    };

    socket.on("create_room", async ({ name, categoryId }: { name?: string; categoryId?: string }, ack?: (r: unknown) => void) => {
      leaveRoom();
      const code = newCode();
      const room: Room = {
        code,
        hostId: socket.id,
        categoryId: categoryId ?? "pop-global",
        mode: "classic",
        totalRounds: 10,
        chaosEnabled: true,
        status: "lobby",
        roundIndex: 0,
        players: new Map(),
        pool: [],
        used: new Set(),
        round: null,
        bids: new Map(),
        rematch: new Set(),
        timers: [],
      };
      room.players.set(socket.id, {
        id: socket.id,
        name: (name || "Anfitrión").slice(0, 16),
        score: 0,
        connected: true,
        answer: null,
      });
      rooms.set(code, room);
      joined = { code };
      socket.join(code);
      ack?.({ ok: true, code });
      emitState(room);
      void getCategoryTracks(room.categoryId).then((pool) => {
        room.pool = pool;
        warmPool(pool);
      });
    });

    socket.on("join_room", ({ code, name }: { code?: string; name?: string }, ack?: (r: unknown) => void) => {
      const room = rooms.get((code ?? "").toUpperCase());
      if (!room) return ack?.({ ok: false, error: "Sala inexistente" });
      if (findRoom() === room) {
        ack?.({ ok: true, code: room.code });
        emitState(room);
        return;
      }
      leaveRoom();
      if (room.players.size >= MAX_PLAYERS) return ack?.({ ok: false, error: "Sala llena" });
      room.players.set(socket.id, {
        id: socket.id,
        name: (name || "Jugador").slice(0, 16),
        score: 0,
        connected: true,
        answer: null,
      });
      joined = { code: room.code };
      socket.join(room.code);
      ack?.({ ok: true, code: room.code });
      emitState(room);
    });

    socket.on("set_config", ({ categoryId, totalRounds, chaosEnabled, mode }: { categoryId?: string; totalRounds?: number; chaosEnabled?: boolean; mode?: RoomMode }) => {
      const room = findRoom();
      if (!room || room.hostId !== socket.id || room.status === "playing") return;
      if (categoryId && categoryId !== room.categoryId) {
        room.categoryId = categoryId;
        room.pool = [];
        room.used.clear();
        void getCategoryTracks(categoryId).then((pool) => {
          room.pool = pool;
          warmPool(pool);
        });
      }
      if (totalRounds) room.totalRounds = Math.max(3, Math.min(20, totalRounds));
      if (typeof chaosEnabled === "boolean") room.chaosEnabled = chaosEnabled;
      if (mode === "classic" || mode === "buzzer" || mode === "auction") room.mode = mode;
      emitState(room);
    });

    socket.on("start_game", () => {
      const room = findRoom();
      if (!room || room.hostId !== socket.id || room.status === "playing") return;
      startGame(room);
    });

    socket.on("room_sync", ({ code }: { code?: string }) => {
      const room = findRoom();
      if (room && room.code === (code ?? "").toUpperCase()) socket.emit("room_state", roomState(room));
    });

    socket.on("leave_room", (_payload, ack?: (r: unknown) => void) => {
      leaveRoom();
      ack?.({ ok: true });
    });

    socket.on("back_to_lobby", () => {
      const room = findRoom();
      if (!room || room.hostId !== socket.id || room.status !== "finished") return;
      clearTimers(room);
      room.status = "lobby";
      room.round = null;
      room.roundIndex = 0;
      room.bids.clear();
      room.rematch.clear();
      room.players.forEach((p) => {
        p.score = 0;
        p.answer = null;
      });
      emitState(room);
    });

    socket.on("close_room", () => {
      const room = findRoom();
      if (!room || room.hostId !== socket.id) return;
      clearTimers(room);
      rooms.delete(room.code);
      io.to(room.code).emit("room_closed", { code: room.code });
      io.in(room.code).socketsLeave(room.code);
      joined = null;
    });

    socket.on("rematch", () => {
      const room = findRoom();
      const player = room?.players.get(socket.id);
      if (!room || !player || room.status !== "finished") return;
      if (room.rematch.has(player.id)) room.rematch.delete(player.id);
      else room.rematch.add(player.id);
      const ready = [...room.players.values()].filter((p) => p.connected);
      if (ready.length > 0 && ready.every((p) => room.rematch.has(p.id))) {
        startGame(room);
        return;
      }
      emitState(room);
    });

    socket.on("bid", ({ seconds }: { seconds?: number }, ack?: (r: unknown) => void) => {
      const room = findRoom();
      const player = room?.players.get(socket.id);
      const round = room?.round;
      if (!room || !player || !round || room.mode !== "auction") return ack?.({ ok: false });
      if (round.auctionWinnerId || room.status !== "playing") return ack?.({ ok: false });
      const value = Math.round(Number(seconds));
      if (!Number.isFinite(value) || value < BID_MIN || value > BID_MAX) return ack?.({ ok: false });
      const current = room.bids.get(player.id);
      if (current !== undefined && current <= value) return ack?.({ ok: false });
      room.bids.delete(player.id);
      room.bids.set(player.id, value);
      io.to(room.code).emit("bid_placed", { playerId: player.id, name: player.name, seconds: value });
      ack?.({ ok: true });
    });

    socket.on("buzz", (_payload, ack?: (r: unknown) => void) => {
      const room = findRoom();
      const player = room?.players.get(socket.id);
      const round = room?.round;
      if (!room || !player || !round || room.status !== "playing") return ack?.({ ok: false });
      if (round.mode !== "buzzer" || round.buzz || round.blocked.has(player.id)) return ack?.({ ok: false });
      if (Date.now() < round.startAt) return ack?.({ ok: false });
      lockBuzz(room, player);
      ack?.({ ok: true });
    });

    socket.on("submit_answer", ({ optionId }: { optionId?: string }, ack?: (r: unknown) => void) => {
      const room = findRoom();
      const player = room?.players.get(socket.id);
      if (!room || !player || !room.round || room.status !== "playing") return;

      if (room.round.mode === "auction") {
        const round = room.round;
        if (round.auctionWinnerId !== player.id || player.answer) return;
        const bid = round.bidSeconds ?? BID_MAX;
        const correct = optionId === round.correctOptionId;
        const stake = (BID_MAX + 1 - bid) * 100;
        player.answer = { optionId: optionId ?? "", ms: bid * 1000, correct, points: correct ? stake : 0 };
        if (correct) {
          player.score += stake;
        } else {
          room.players.forEach((p) => {
            if (p.id === player.id || !p.connected) return;
            p.score += Math.round(stake / 2);
            p.answer = { optionId: "", ms: 0, correct: false, points: Math.round(stake / 2) };
          });
        }
        ack?.({ ok: true, correct });
        clearTimers(room);
        endRound(room);
        return;
      }

      if (room.round.mode === "buzzer") {
        if (room.round.buzz?.playerId !== player.id) return;
        const correct = optionId === room.round.correctOptionId;
        player.answer = {
          optionId: optionId ?? "",
          ms: Math.max(0, room.round.playedMs),
          correct,
          points: correct ? 1 : 0,
        };
        ack?.({ ok: true, correct });
        if (correct) {
          player.score += 1;
          clearTimers(room);
          endRound(room);
          return;
        }
        releaseBuzz(room, player.id, "wrong");
        return;
      }

      if (player.answer) return;
      const elapsed = Date.now() - room.round.startAt;
      const correct = optionId === room.round.correctOptionId;
      const points = correct ? pointsFor(elapsed, room.round.chaos) : 0;
      player.answer = { optionId: optionId ?? "", ms: Math.max(0, elapsed), correct, points };
      player.score += points;
      ack?.({ ok: true });
      io.to(room.code).emit("player_answered", { id: player.id, name: player.name });
      if ([...room.players.values()].every((p) => !p.connected || p.answer)) endRound(room);
    });

    socket.on("ping_time", (_payload, ack?: (r: unknown) => void) => ack?.({ serverTime: Date.now() }));

    socket.on("reaction", ({ emoji }: { emoji?: string }) => {
      const room = findRoom();
      const player = room?.players.get(socket.id);
      if (!room || !player) return;
      const clean = String(emoji ?? "").slice(0, 4);
      if (!clean) return;
      io.to(room.code).emit("reaction", {
        id: `${socket.id}-${Date.now()}`,
        name: player.name,
        emoji: clean,
      });
    });

    socket.on("disconnect", leaveRoom);
  });
}

export function roomExists(code: string): boolean {
  return rooms.has(code.toUpperCase());
}
