"use client";

import { AnimatePresence, motion } from "motion/react";
import {
  BellRing,
  Check,
  Coins,
  Crown,
  Dices,
  DoorOpen,
  Flame,
  Gavel,
  HandMetal,
  Heart,
  Laugh,
  LoaderCircle,
  LogOut,
  MicOff,
  RotateCcw,
  Settings2,
  Share2,
  Sparkles,
  ThumbsUp,
  X,
  Zap,
  type LucideIcon,
} from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { AnimatedNumber } from "@/components/AnimatedNumber";
import { CategoryPicker } from "@/components/CategoryPicker";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { SolutionCard } from "@/components/SolutionCard";
import { Waveform } from "@/components/Waveform";
import { buzz as buzzFx, celebrate, fail, tick } from "@/lib/fx";
import { accentStyle, modeOf } from "@/lib/modes";
import { getCategories } from "@/lib/api";
import { getSocket, serverNow, socketIdSnapshot, subscribeSocketId, syncClock } from "@/lib/socket";
import { shareText } from "@/lib/share";
import { updateProfile } from "@/lib/storage";
import type {
  AuctionResult,
  AuctionStart,
  BidPlaced,
  BuzzLock,
  BuzzResume,
  Category,
  Reaction,
  RoomMode,
  RoomState,
  RoundEnd,
  RoundStart,
} from "@/lib/types";
import { usePreviewPlayer } from "@/lib/useAudio";
import { useProfile } from "@/lib/useProfile";

const CHAOS: Record<string, { label: string; icon: LucideIcon }> = {
  double: { label: "Doble o Nada · puntos x2", icon: Dices },
  short: { label: "Sin Voces · solo 2 segundos", icon: MicOff },
};

/** Reaction ids travel over the socket (max 4 chars); the icon is resolved client-side. */
const REACTIONS: { id: string; icon: LucideIcon; color: string }[] = [
  { id: "fire", icon: Flame, color: "#ff8a1f" },
  { id: "lol", icon: Laugh, color: "#ffd23f" },
  { id: "wow", icon: Sparkles, color: "#3db8ff" },
  { id: "rock", icon: HandMetal, color: "#c8ff2e" },
  { id: "clap", icon: ThumbsUp, color: "#22e5a0" },
  { id: "love", icon: Heart, color: "#ff3d8b" },
];

const ROOM_MODES: { id: RoomMode; title: string; detail: string; icon: LucideIcon; color: string }[] = [
  { id: "classic", title: "Clásico", detail: "Todos responden, gana la velocidad", icon: Zap, color: "#c8ff2e" },
  { id: "buzzer", title: "Buzzer", detail: "El primero que aprieta corta el tema", icon: BellRing, color: "#ff3d8b" },
  { id: "auction", title: "Subasta", detail: "Apostás segundos: el más audaz escucha", icon: Gavel, color: "#ffd23f" },
];

const PODIUM = ["bg-yellow text-ink", "bg-white/85 text-ink", "bg-orange text-ink"];

const INVITE_MODE: Record<RoomMode, string> = {
  classic: "⚡ Modo Clásico: gana el más rápido",
  buzzer: "🔔 Modo Buzzer: el primero que aprieta responde",
  auction: "💰 Modo Subasta: apostá en cuántos segundos la sacás",
};

/** Deferred so React's dev double-mount doesn't kick the player out of the room. */
let pendingLeave: ReturnType<typeof setTimeout> | null = null;

export default function RoomPage() {
  const router = useRouter();
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();

  const stored = useProfile().nickname;
  const [typedNickname, setTypedNickname] = useState<string | null>(null);
  const nickname = typedNickname ?? stored;
  const [manuallyJoined, setManuallyJoined] = useState(false);
  const [closed, setClosed] = useState(false);
  const [state, setState] = useState<RoomState | null>(null);
  const [categories, setCategories] = useState<Category[]>([]);
  const [round, setRound] = useState<RoundStart | null>(null);
  const [result, setResult] = useState<RoundEnd | null>(null);
  const [picked, setPicked] = useState<string | null>(null);
  const [answered, setAnswered] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [buzz, setBuzz] = useState<BuzzLock | null>(null);
  const [blocked, setBlocked] = useState<string[]>([]);
  const [buzzLeft, setBuzzLeft] = useState(0);
  const [playback, setPlayback] = useState<{ at: number; offsetMs: number; clipMs: number | null } | null>(null);
  const [auction, setAuction] = useState<AuctionStart | null>(null);
  const [bids, setBids] = useState<BidPlaced[]>([]);
  const [auctionResult, setAuctionResult] = useState<AuctionResult | null>(null);
  const [bidLeft, setBidLeft] = useState(0);
  const [myBid, setMyBid] = useState<number | null>(null);
  const [reactions, setReactions] = useState<Reaction[]>([]);
  const reactionTimers = useRef<Set<ReturnType<typeof setTimeout>>>(new Set());
  const selfId = useSyncExternalStore(subscribeSocketId, socketIdSnapshot, () => null);
  const roundMode = useRef<RoomMode>("classic");

  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    syncClock();
    if (pendingLeave) clearTimeout(pendingLeave);
    pendingLeave = null;

    const onState = (s: RoomState) => {
      if (s.code !== code) return;
      setState(s);
      if (s.status !== "lobby") return;
      setResult(null);
      setRound(null);
      setAuction(null);
      setAuctionResult(null);
      setBuzz(null);
      setPlayback(null);
    };
    const onClosed = ({ code: closedCode }: { code: string }) => {
      if (closedCode !== code) return;
      stop();
      setClosed(true);
    };
    const onRoundStart = (payload: RoundStart) => {
      roundMode.current = payload.mode;
      setRound(payload);
      setResult(null);
      setPicked(null);
      setAnswered([]);
      setBuzz(null);
      setBlocked([]);
      setAuction(null);
      setPlayback({
        at: payload.startAt,
        offsetMs: 0,
        clipMs: payload.mode === "auction" ? payload.clipMs ?? null : payload.chaos === "short" ? 2000 : null,
      });
    };
    const onAuctionStart = (payload: AuctionStart) => {
      stop();
      setAuction(payload);
      setAuctionResult(null);
      setBids([]);
      setMyBid(null);
      setRound(null);
      setResult(null);
      setPlayback(null);
    };
    const onBidPlaced = (payload: BidPlaced) =>
      setBids((list) => [...list.filter((b) => b.playerId !== payload.playerId), payload]);
    const onAuctionResult = (payload: AuctionResult) => {
      setAuction(null);
      setAuctionResult(payload);
    };
    const onRoundEnd = (payload: RoundEnd) => {
      const mine = payload.results.find((r) => r.id === socket.id);
      if (mine && (mine.correct || mine.points > 0)) celebrate(undefined, mine.correct);
      else if (mine && mine.ms !== null && roundMode.current !== "buzzer") fail();
      stop();
      setResult(payload);
      setRound(null);
      setBuzz(null);
      setPlayback(null);
    };
    const onBuzzLock = (payload: BuzzLock) => {
      buzzFx();
      stop();
      setPlayback(null);
      setBuzz(payload);
      setPicked(null);
    };
    const onBuzzResume = (payload: BuzzResume) => {
      if (payload.reason === "wrong" && payload.playerId === socket.id) fail();
      setBuzz(null);
      setBlocked(payload.blocked);
      setPlayback({ at: payload.resumeAt, offsetMs: payload.offsetMs, clipMs: null });
    };
    const timers = reactionTimers.current;
    const onReaction = (payload: Reaction) => {
      setReactions((r) => [...r.slice(-6), payload]);
      const timer = setTimeout(() => {
        timers.delete(timer);
        setReactions((r) => r.filter((x) => x.id !== payload.id));
      }, 2600);
      timers.add(timer);
    };
    const onAnswered = ({ name }: { name: string }) => setAnswered((a) => [...a, name]);
    const onError = ({ message }: { message: string }) => setError(message);
    const onConnect = () => syncClock();

    socket.on("connect", onConnect);
    socket.on("room_state", onState);
    socket.on("room_closed", onClosed);
    socket.emit("room_sync", { code });
    socket.on("round_start", onRoundStart);
    socket.on("round_end", onRoundEnd);
    socket.on("player_answered", onAnswered);
    socket.on("auction_start", onAuctionStart);
    socket.on("bid_placed", onBidPlaced);
    socket.on("auction_result", onAuctionResult);
    socket.on("buzz_lock", onBuzzLock);
    socket.on("buzz_resume", onBuzzResume);
    socket.on("reaction", onReaction);
    socket.on("error_msg", onError);
    return () => {
      socket.off("connect", onConnect);
      socket.off("room_state", onState);
      socket.off("room_closed", onClosed);
      socket.off("round_start", onRoundStart);
      socket.off("round_end", onRoundEnd);
      socket.off("player_answered", onAnswered);
      socket.off("auction_start", onAuctionStart);
      socket.off("bid_placed", onBidPlaced);
      socket.off("auction_result", onAuctionResult);
      socket.off("buzz_lock", onBuzzLock);
      socket.off("buzz_resume", onBuzzResume);
      socket.off("reaction", onReaction);
      socket.off("error_msg", onError);
      timers.forEach(clearTimeout);
      timers.clear();
      pendingLeave = setTimeout(() => getSocket().emit("leave_room"), 0);
    };
  }, [stop, code]);

  // Start (or resume) playback exactly at the timestamp the server scheduled.
  useEffect(() => {
    if (!playback || status !== "ready") return;
    // In the auction only the player who won the bid gets to hear the clip.
    if (round?.mode === "auction" && round.auctionWinnerId !== selfId) return;
    const delay = playback.at - serverNow();
    if (delay > 0) {
      const id = setTimeout(() => playClip(playback.clipMs, playback.offsetMs), delay);
      return () => clearTimeout(id);
    }
    playClip(playback.clipMs, Math.min(25_000, playback.offsetMs - delay));
  }, [playback, status, playClip, round, selfId]);

  useEffect(() => {
    if (!auction) return;
    const id = setInterval(() => setBidLeft(Math.max(0, auction.deadline - serverNow())), 100);
    return () => clearInterval(id);
  }, [auction]);

  useEffect(() => {
    if (!buzz) return;
    const id = setInterval(() => setBuzzLeft(Math.max(0, buzz.deadline - serverNow())), 100);
    return () => clearInterval(id);
  }, [buzz]);

  useEffect(() => {
    if (!round) return;
    const id = setInterval(() => {
      setCountdown(Math.max(0, round.startAt + round.answerWindowMs - serverNow()));
    }, 100);
    return () => clearInterval(id);
  }, [round]);

  function join() {
    if (!nickname.trim()) return setError("Poné un apodo");
    updateProfile({ nickname: nickname.trim() });
    getSocket().emit(
      "join_room",
      { code, name: nickname.trim() },
      (res: { ok: boolean; error?: string }) => {
        if (res.ok) {
          setManuallyJoined(true);
          setError(null);
        } else setError(res.error ?? "No pudimos entrar");
      },
    );
  }

  function leave() {
    stop();
    getSocket().emit("leave_room");
    router.push("/sala");
  }

  function closeRoom() {
    if (!window.confirm("¿Cerrar la sala para todos?")) return;
    getSocket().emit("close_room");
    router.push("/sala");
  }

  function pick(optionId: string) {
    if (picked) return;
    setPicked(optionId);
    getSocket().emit("submit_answer", { optionId });
  }

  function placeBid(seconds: number) {
    tick();
    getSocket().emit("bid", { seconds }, (res: { ok: boolean }) => {
      if (res?.ok) setMyBid(seconds);
    });
  }

  function hitBuzzer() {
    getSocket().emit("buzz", {});
  }

  async function shareLink() {
    const url = `${window.location.origin}/sala/${code}`;
    const category = categories.find((c) => c.id === state?.categoryId);
    const mode = INVITE_MODE[state?.mode ?? "classic"];
    const text = [
      "🎵 ¡Te desafío en En Una Nota!",
      category ? `${mode} · ${category.emoji} ${category.name}` : mode,
      `Entrá con el código *${code}* y demostrá quién sabe más de música 👇`,
      url,
    ].join("\n");
    if ((await shareText(text)) === "failed") return;
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // The host is already inside the room right after creating it.
  const joined = manuallyJoined || state?.code === code;
  const isHost = Boolean(state && selfId && state.hostId === selfId);
  const isBuzzer = round?.mode === "buzzer";
  const isAuction = round?.mode === "auction";
  const wonAuction = Boolean(isAuction && selfId && round?.auctionWinnerId === selfId);
  const myBuzz = Boolean(buzz && selfId && buzz.playerId === selfId);
  const iAmBlocked = Boolean(selfId && blocked.includes(selfId));
  const rematchVotes = state?.rematchVotes ?? [];
  const votedRematch = Boolean(selfId && rematchVotes.includes(selfId));

  const accent = accentStyle(modeOf("sala").color);
  const roomMode = ROOM_MODES.find((m) => m.id === (round?.mode ?? state?.mode)) ?? ROOM_MODES[0];

  if (closed) {
    return (
      <Shell style={accent}>
        <motion.section
          initial={{ opacity: 0, scale: 0.94 }}
          animate={{ opacity: 1, scale: 1 }}
          className="card space-y-4 p-6 text-center"
        >
          <span className="tile mx-auto h-16 w-16">
            <DoorOpen size={30} strokeWidth={2.4} />
          </span>
          <p className="font-display text-2xl font-extrabold">El anfitrión cerró la sala</p>
          <button type="button" className="btn-accent w-full" onClick={() => router.push("/sala")}>
            Crear o unirme a otra sala
          </button>
        </motion.section>
      </Shell>
    );
  }

  if (!joined) {
    return (
      <Shell style={accent}>
        <section className="card space-y-4 p-5 sm:p-6">
          <p className="eyebrow">Te invitaron a la sala</p>
          <p className="font-display text-6xl font-extrabold tracking-[0.25em] text-accent">{code}</p>
          <input
            value={nickname}
            onChange={(e) => setTypedNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            maxLength={16}
            placeholder="Tu apodo"
            className="field"
          />
          <button type="button" className="btn-accent w-full text-lg" onClick={join}>
            Entrar a la sala
          </button>
          {error && <p className="text-sm font-semibold text-coral">{error}</p>}
        </section>
      </Shell>
    );
  }

  return (
    <Shell style={accent}>
      <section className="card flex flex-wrap items-center justify-between gap-3 p-4 sm:p-5">
        <div>
          <p className="eyebrow">Código de sala</p>
          <p className="font-display text-4xl font-extrabold tracking-[0.25em] text-accent">{code}</p>
        </div>
        <div className="flex gap-2">
          <button type="button" className="btn-ghost px-4" onClick={shareLink}>
            {copied ? <Check size={18} strokeWidth={2.8} /> : <Share2 size={18} strokeWidth={2.4} />}
            {copied ? "¡Copiado!" : "Invitar"}
          </button>
          <button type="button" className="btn-ghost px-4 text-coral" onClick={leave} aria-label="Salir de la sala">
            <LogOut size={18} strokeWidth={2.4} />
            <span className="hidden sm:inline">Salir</span>
          </button>
        </div>
      </section>

      {state?.status === "lobby" && (
        <section className="card space-y-5 p-5 sm:p-6">
          <div className="flex items-center gap-3">
            <span className="relative flex h-3 w-3">
              <span className="absolute inset-0 rounded-full bg-accent" style={{ animation: "ring 1.4s ease-out infinite" }} />
              <span className="relative h-3 w-3 rounded-full bg-accent" />
            </span>
            <p className="text-sm font-semibold text-white/70">
              {state.players.length} en la sala ·{" "}
              {isHost ? "elegí el modo y arrancá" : "esperando que el anfitrión arranque"}
            </p>
          </div>
          {!isHost && (
            <div className="flex items-center gap-3 rounded-2xl bg-white/[0.04] p-3" style={accentStyle(roomMode.color)}>
              <span className="tile h-10 w-10">
                <roomMode.icon size={20} strokeWidth={2.4} />
              </span>
              <div>
                <p className="font-display font-bold">Modo {roomMode.title}</p>
                <p className="text-xs text-white/55">{roomMode.detail}</p>
              </div>
            </div>
          )}
          {isHost && (
            <>
              <CategoryPicker
                categories={categories}
                value={state.categoryId}
                onChange={(id) => getSocket().emit("set_config", { categoryId: id })}
              />
              <div className="space-y-2.5">
                <p className="eyebrow">Modo</p>
                <div className="grid gap-2 sm:grid-cols-3">
                  {ROOM_MODES.map((m) => {
                    const active = state.mode === m.id;
                    return (
                      <motion.button
                        key={m.id}
                        type="button"
                        whileHover={{ y: -2 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={() => getSocket().emit("set_config", { mode: m.id })}
                        style={accentStyle(m.color)}
                        className={`flex items-center gap-3 rounded-2xl border p-3 text-left transition-colors sm:flex-col sm:items-start ${
                          active ? "border-accent bg-accent/10" : "border-white/10 bg-surface-2 hover:border-white/25"
                        }`}
                      >
                        <motion.span
                          animate={active ? { rotate: [0, -12, 12, 0], scale: [1, 1.15, 1] } : { rotate: 0, scale: 1 }}
                          transition={{ duration: 0.5 }}
                          className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${active ? "bg-accent text-ink" : "tile"}`}
                        >
                          <m.icon size={20} strokeWidth={2.4} />
                        </motion.span>
                        <span>
                          <span className="block font-display font-extrabold">{m.title}</span>
                          <span className="block text-xs text-white/55">{m.detail}</span>
                        </span>
                      </motion.button>
                    );
                  })}
                </div>
              </div>
              <label
                className={`flex cursor-pointer items-center justify-between gap-3 rounded-2xl bg-white/[0.04] p-3 text-sm font-semibold text-white/75 ${
                  state.mode !== "classic" ? "pointer-events-none opacity-40" : ""
                }`}
              >
                <span className="flex items-center gap-2">
                  <Dices size={18} strokeWidth={2.4} className="text-accent" />
                  Ruleta de caos (Doble o Nada / Sin Voces)
                </span>
                <input
                  type="checkbox"
                  disabled={state.mode !== "classic"}
                  checked={state.chaosEnabled}
                  onChange={(e) => getSocket().emit("set_config", { chaosEnabled: e.target.checked })}
                  className="peer sr-only"
                />
                <span className="relative h-7 w-12 shrink-0 rounded-full bg-white/15 transition-colors peer-checked:bg-accent">
                  <motion.span
                    layout
                    transition={{ type: "spring", stiffness: 600, damping: 30 }}
                    className={`absolute top-1 h-5 w-5 rounded-full bg-white shadow ${state.chaosEnabled ? "right-1" : "left-1"}`}
                  />
                </span>
              </label>
              <button type="button" className="btn-accent w-full text-lg" onClick={() => getSocket().emit("start_game")}>
                Arrancar {state.totalRounds} rondas
              </button>
              <button
                type="button"
                className="w-full text-center text-sm font-semibold text-coral/80 transition hover:text-coral"
                onClick={closeRoom}
              >
                Cerrar sala
              </button>
            </>
          )}
        </section>
      )}

      {auction && (
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="card space-y-4 p-5 sm:p-6"
          style={accentStyle("#ffd23f")}
        >
          <div className="flex items-center justify-between">
            <span className="eyebrow">
              Ronda {auction.roundIndex + 1} / {auction.totalRounds}
            </span>
            <span className={`font-display text-2xl font-extrabold tabular-nums ${bidLeft < 4000 ? "text-coral" : ""}`}>
              {(bidLeft / 1000).toFixed(1)}s
            </span>
          </div>
          <p className="flex items-start gap-2 rounded-2xl bg-accent/10 px-4 py-3 text-sm font-semibold text-accent">
            <Coins size={18} strokeWidth={2.4} className="mt-0.5 shrink-0" />
            {auction.hint}
          </p>
          <p className="text-center text-sm text-white/60">
            ¿En cuántos segundos la sacás? La apuesta más baja se lleva el turno.
          </p>
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6">
            {Array.from({ length: auction.maxBid - auction.minBid + 1 }, (_, i) => auction.minBid + i).map((s) => (
              <motion.button
                key={s}
                type="button"
                whileTap={{ scale: 0.88 }}
                disabled={myBid !== null && s >= myBid}
                onClick={() => placeBid(s)}
                className={`rounded-2xl border py-3 font-display text-xl font-extrabold shadow-[0_4px_0_rgba(0,0,0,0.5)] transition-colors disabled:opacity-25 ${
                  myBid === s ? "border-accent bg-accent text-ink" : "border-white/10 bg-surface-2 hover:border-accent/70"
                }`}
              >
                {s}
              </motion.button>
            ))}
          </div>
          <ul className="space-y-1.5 text-sm">
            <AnimatePresence>
              {[...bids]
                .sort((a, b) => a.seconds - b.seconds)
                .map((b, i) => (
                  <motion.li
                    layout
                    key={b.playerId}
                    initial={{ opacity: 0, x: -10 }}
                    animate={{ opacity: 1, x: 0 }}
                    className={`flex items-center justify-between rounded-xl px-3 py-2 ${i === 0 ? "bg-accent/15 text-accent" : "bg-white/[0.04] text-white/70"}`}
                  >
                    <span className="font-semibold">{b.name}</span>
                    <span className="font-display font-extrabold tabular-nums">{b.seconds}s</span>
                  </motion.li>
                ))}
            </AnimatePresence>
          </ul>
        </motion.section>
      )}

      {auctionResult && !round && !auction && (
        <motion.p
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          className="text-center font-display text-lg font-bold text-white/70"
        >
          {auctionResult.name ? `${auctionResult.name} se la juega en ${auctionResult.seconds}s…` : "Nadie apostó, tema quemado"}
        </motion.p>
      )}

      {round && (
        <motion.section
          key={round.roundIndex}
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          className="card space-y-4 p-5 sm:p-6"
          style={accentStyle(roomMode.color)}
        >
          <div className="flex items-center justify-between">
            <span className="eyebrow">
              Ronda {round.roundIndex + 1} / {round.totalRounds}
            </span>
            <span className="pill">
              <roomMode.icon size={14} strokeWidth={2.6} />
              {isBuzzer ? "Buzzer" : isAuction ? `${round.bidSeconds}s` : `${(countdown / 1000).toFixed(1)}s`}
            </span>
          </div>
          {!isBuzzer && !isAuction && (
            <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
              <motion.div
                className={`h-full rounded-full ${countdown < 4000 ? "bg-coral" : "bg-accent"}`}
                animate={{ width: `${Math.min(100, (countdown / round.answerWindowMs) * 100)}%` }}
                transition={{ ease: "linear", duration: 0.1 }}
              />
            </div>
          )}
          {round.chaos !== "none" && CHAOS[round.chaos] && (
            <motion.p
              initial={{ scale: 0.6, rotate: -4, opacity: 0 }}
              animate={{ scale: 1, rotate: 0, opacity: 1 }}
              transition={{ type: "spring", stiffness: 400, damping: 12 }}
              className="flex items-center justify-center gap-2 rounded-xl bg-yellow px-3 py-2 text-center text-sm font-extrabold text-ink"
            >
              {(() => {
                const ChaosIcon = CHAOS[round.chaos].icon;
                return <ChaosIcon size={17} strokeWidth={2.6} />;
              })()}
              {CHAOS[round.chaos].label}
            </motion.p>
          )}
          <div className="stage">
            <Waveform active={status === "playing"} getAnalyser={getAnalyser} color={roomMode.color} />
          </div>
          {status === "loading" && (!isAuction || wonAuction) && (
            <p className="flex items-center justify-center gap-2 text-xs font-bold uppercase tracking-widest text-white/45">
              <LoaderCircle size={14} className="animate-spin" />
              Cargando audio… te sumás desde donde va el tema
            </p>
          )}
          {status === "error" && (
            <p className="text-center text-xs font-semibold text-coral">
              No pudimos cargar este tema en tu dispositivo · revisá la conexión
            </p>
          )}

          {isAuction ? (
            wonAuction ? (
              <>
                <p className="text-center font-display font-bold text-accent">
                  Ganaste la subasta: {round.bidSeconds}s de audio. ¡Dale!
                </p>
                <OptionGrid options={round.options} onPick={pick} pickedId={picked} locked={Boolean(picked)} />
              </>
            ) : (
              <p className="rounded-2xl bg-accent/10 py-7 text-center font-display text-xl font-bold text-accent">
                {auctionResult?.name ?? "Alguien"} se la juega en {round.bidSeconds}s…
              </p>
            )
          ) : isBuzzer ? (
            myBuzz ? (
              <>
                <motion.p
                  initial={{ scale: 0.8 }}
                  animate={{ scale: 1 }}
                  className="text-center font-display text-lg font-extrabold text-lime"
                >
                  ¡Apretaste primero! Respondé en {(buzzLeft / 1000).toFixed(1)}s
                </motion.p>
                <OptionGrid options={round.options} onPick={pick} pickedId={picked} locked={Boolean(picked)} />
              </>
            ) : buzz ? (
              <motion.p
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                className="flex items-center justify-center gap-2 rounded-2xl bg-accent/10 py-7 text-center font-display text-xl font-bold text-accent"
              >
                <BellRing size={22} strokeWidth={2.4} />
                {buzz.name} está respondiendo…
              </motion.p>
            ) : (
              <div className="grid place-items-center py-2">
                <motion.button
                  type="button"
                  whileHover={iAmBlocked ? undefined : { scale: 1.03 }}
                  whileTap={iAmBlocked ? undefined : { scale: 0.9, y: 6 }}
                  disabled={iAmBlocked}
                  onClick={hitBuzzer}
                  className={`relative grid aspect-square w-52 place-items-center rounded-full font-display text-3xl font-extrabold sm:w-60 ${
                    iAmBlocked
                      ? "cursor-not-allowed bg-white/5 text-white/30"
                      : "bg-accent text-ink shadow-[0_10px_0_color-mix(in_oklab,var(--accent)_50%,black),0_30px_60px_-15px_var(--accent)]"
                  }`}
                >
                  {!iAmBlocked && (
                    <span className="absolute inset-0 rounded-full bg-accent" style={{ animation: "ring 1.6s ease-out infinite" }} />
                  )}
                  <span className="relative flex flex-col items-center gap-1">
                    {iAmBlocked ? <X size={40} strokeWidth={2.6} /> : <BellRing size={40} strokeWidth={2.6} />}
                    {iAmBlocked ? <span className="text-base">Fuera de este tema</span> : "¡LA SÉ!"}
                  </span>
                </motion.button>
              </div>
            )
          ) : (
            <>
              <OptionGrid options={round.options} onPick={pick} pickedId={picked} locked={Boolean(picked)} />
              {picked && (
                <p className="flex items-center justify-center gap-2 text-sm font-semibold text-white/55">
                  <LoaderCircle size={14} className="animate-spin" />
                  Respuesta enviada
                </p>
              )}
              {answered.length > 0 && (
                <div className="flex flex-wrap justify-center gap-1.5">
                  <AnimatePresence>
                    {answered.map((n, i) => (
                      <motion.span
                        key={`${n}-${i}`}
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ type: "spring", stiffness: 500, damping: 18 }}
                        className="rounded-full bg-white/8 px-2.5 py-1 text-xs font-bold text-white/60"
                      >
                        {n} respondió
                      </motion.span>
                    ))}
                  </AnimatePresence>
                </div>
              )}
            </>
          )}

          <div className="flex justify-center gap-2">
            {REACTIONS.map((r) => (
              <motion.button
                key={r.id}
                type="button"
                whileHover={{ y: -3 }}
                whileTap={{ scale: 0.8, rotate: -12 }}
                aria-label={r.id}
                onClick={() => getSocket().emit("reaction", { emoji: r.id })}
                style={{ color: r.color }}
                className="grid h-11 w-11 place-items-center rounded-full border border-white/10 bg-white/5 transition-colors hover:bg-white/12"
              >
                <r.icon size={20} strokeWidth={2.4} />
              </motion.button>
            ))}
          </div>

          <div className="pointer-events-none relative h-0">
            <AnimatePresence>
              {reactions.map((r, i) => {
                const meta = REACTIONS.find((x) => x.id === r.emoji);
                const Icon = meta?.icon;
                return (
                  <motion.span
                    key={r.id}
                    initial={{ opacity: 0, y: 0, scale: 0.4 }}
                    animate={{ opacity: [0, 1, 1, 0], y: -180, scale: 1, x: ((i % 3) - 1) * 40 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 2.4, ease: "easeOut" }}
                    className="absolute bottom-0 left-1/2 flex -translate-x-1/2 items-center gap-1.5 whitespace-nowrap rounded-full bg-surface-2 px-3 py-1.5 text-sm font-bold shadow-xl"
                    style={{ color: meta?.color }}
                  >
                    {Icon ? <Icon size={18} strokeWidth={2.6} /> : r.emoji}
                    <span className="text-white/80">{r.name}</span>
                  </motion.span>
                );
              })}
            </AnimatePresence>
          </div>
        </motion.section>
      )}

      <AnimatePresence>
        {result && (
          <motion.section
            initial={{ opacity: 0, y: 16, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0 }}
            className="card space-y-3 p-5 sm:p-6"
          >
            <SolutionCard title={result.solution.title} artist={result.solution.artist} artwork={result.solution.artwork} />
            <ul className="space-y-1.5 text-sm">
              {result.results.map((r, i) => (
                <motion.li
                  key={r.id}
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: 0.1 + i * 0.05 }}
                  className="flex items-center gap-2.5 rounded-xl bg-white/[0.04] px-3 py-2"
                >
                  <span
                    className={`grid h-6 w-6 place-items-center rounded-lg ${r.correct ? "bg-lime text-ink" : "bg-coral/20 text-coral"}`}
                  >
                    {r.correct ? <Check size={14} strokeWidth={3} /> : <X size={14} strokeWidth={3} />}
                  </span>
                  <span className="flex-1 truncate font-semibold">{r.name}</span>
                  <span className="font-display font-bold tabular-nums text-white/70">
                    {r.points > 0 ? <span className="text-lime">+{r.points}</span> : "—"}
                    {r.ms !== null && r.correct ? ` · ${(r.ms / 1000).toFixed(1)}s` : ""}
                  </span>
                </motion.li>
              ))}
            </ul>
            {!result.isLastRound && (
              <p className="text-center text-xs font-semibold text-white/40">Próxima ronda en unos segundos…</p>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {state && state.players.length > 0 && (
        <section className="card space-y-3 p-5 sm:p-6">
          <p className="eyebrow">{state.status === "finished" ? "Podio final" : "Tabla"}</p>
          <ol className="space-y-1.5 text-sm">
            {state.players.map((p, i) => (
              <motion.li
                layout
                key={p.id}
                transition={{ type: "spring", stiffness: 500, damping: 35 }}
                className={`flex items-center gap-3 rounded-xl px-3 py-2.5 ${
                  p.id === selfId ? "bg-accent/10 ring-1 ring-accent/40" : "bg-white/[0.04]"
                } ${p.connected ? "" : "opacity-50"}`}
              >
                <span
                  className={`grid h-7 w-7 place-items-center rounded-lg font-display text-sm font-extrabold ${
                    PODIUM[i] ?? "bg-white/10 text-white/60"
                  }`}
                >
                  {i + 1}
                </span>
                <span className="flex flex-1 items-center gap-1.5 truncate font-semibold">
                  {p.name}
                  {p.id === state.hostId && <Crown size={15} strokeWidth={2.6} className="shrink-0 text-yellow" />}
                </span>
                <AnimatedNumber value={p.score} className="font-display text-base font-extrabold" />
              </motion.li>
            ))}
          </ol>
          {state.status === "finished" && (
            <div className="mt-3 space-y-2.5">
              <button
                type="button"
                className={votedRematch ? "btn-ghost w-full" : "btn-accent w-full text-lg"}
                onClick={() => getSocket().emit("rematch")}
              >
                {votedRematch ? <Check size={18} strokeWidth={2.8} /> : <RotateCcw size={18} strokeWidth={2.6} />}
                {votedRematch ? "Pediste revancha" : "Revancha"}
              </button>
              <div className="flex items-center gap-2">
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/10">
                  <motion.div
                    className="h-full rounded-full bg-accent"
                    animate={{ width: `${(rematchVotes.length / Math.max(1, state.players.length)) * 100}%` }}
                  />
                </div>
                <p className="text-xs font-semibold text-white/50">
                  {rematchVotes.length}/{state.players.length} quieren revancha
                </p>
              </div>
              {rematchVotes.length < state.players.length && (
                <p className="text-center text-xs text-white/40">Arranca sola cuando estén todos</p>
              )}
              {isHost && (
                <div className="grid gap-2 sm:grid-cols-3">
                  <button type="button" className="btn-ghost w-full" onClick={() => getSocket().emit("start_game")}>
                    <Zap size={17} strokeWidth={2.6} />
                    Arrancar ya
                  </button>
                  <button type="button" className="btn-ghost w-full" onClick={() => getSocket().emit("back_to_lobby")}>
                    <Settings2 size={17} strokeWidth={2.6} />
                    Cambiar modo
                  </button>
                  <button type="button" className="btn-ghost w-full text-coral" onClick={closeRoom}>
                    <DoorOpen size={17} strokeWidth={2.6} />
                    Cerrar sala
                  </button>
                </div>
              )}
              {!isHost && (
                <p className="flex items-center justify-center gap-1.5 text-center text-xs text-white/45">
                  <Crown size={13} className="text-yellow" />
                  El anfitrión puede cambiar el modo o cerrar la sala
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {error && <p className="text-sm font-semibold text-coral">{error}</p>}
    </Shell>
  );
}
