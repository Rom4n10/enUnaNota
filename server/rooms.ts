import type { Server, Socket } from "socket.io";
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

export type ChaosType = "none" | "double" | "short";
export type RoomMode = "classic" | "buzzer";

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
    };
    room.status = "playing";
    room.players.forEach((p) => (p.answer = null));

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

    const findRoom = () => (joined ? rooms.get(joined.code) : undefined);

    socket.on("create_room", async ({ name, categoryId }: { name?: string; categoryId?: string }, ack?: (r: unknown) => void) => {
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
      if (mode === "classic" || mode === "buzzer") room.mode = mode;
      emitState(room);
    });

    socket.on("start_game", () => {
      const room = findRoom();
      if (!room || room.hostId !== socket.id || room.status === "playing") return;
      startGame(room);
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

    socket.on("disconnect", () => {
      const room = findRoom();
      if (!room) return;
      if (room.round?.buzz?.playerId === socket.id) releaseBuzz(room, socket.id, "timeout");
      room.players.delete(socket.id);
      room.rematch.delete(socket.id);
      if (room.players.size === 0) {
        clearTimers(room);
        rooms.delete(room.code);
        return;
      }
      if (room.hostId === socket.id) room.hostId = [...room.players.keys()][0];
      emitState(room);
    });
  });
}

export function roomExists(code: string): boolean {
  return rooms.has(code.toUpperCase());
}
