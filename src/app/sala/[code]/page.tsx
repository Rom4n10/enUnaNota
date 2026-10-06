"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { Waveform } from "@/components/Waveform";
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

const CHAOS_LABEL: Record<string, string> = {
  double: "🎲 Doble o Nada · puntos x2",
  short: "🤫 Sin Voces · solo 2 segundos",
};

const REACTIONS = ["🔥", "😂", "😱", "👏", "🫠"];

const INVITE_MODE: Record<RoomMode, string> = {
  classic: "⚡ Modo Clásico: gana el más rápido",
  buzzer: "🔔 Modo Buzzer: el primero que aprieta responde",
  auction: "💰 Modo Subasta: apostá en cuántos segundos la sacás",
};

export default function RoomPage() {
  const params = useParams<{ code: string }>();
  const code = (params.code ?? "").toUpperCase();

  const stored = useProfile().nickname;
  const [typedNickname, setTypedNickname] = useState<string | null>(null);
  const nickname = typedNickname ?? stored;
  const [manuallyJoined, setManuallyJoined] = useState(false);
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

  const { status, playClip, stop, getAnalyser } = usePreviewPlayer(round?.audioUrl ?? null);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  useEffect(() => {
    const socket = getSocket();
    syncClock();

    const onState = (s: RoomState) => setState(s);
    const onRoundStart = (payload: RoundStart) => {
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
      stop();
      setResult(payload);
      setRound(null);
      setBuzz(null);
      setPlayback(null);
    };
    const onBuzzLock = (payload: BuzzLock) => {
      stop();
      setPlayback(null);
      setBuzz(payload);
      setPicked(null);
    };
    const onBuzzResume = (payload: BuzzResume) => {
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
    };
  }, [stop]);

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

  function pick(optionId: string) {
    if (picked) return;
    setPicked(optionId);
    getSocket().emit("submit_answer", { optionId });
  }

  function placeBid(seconds: number) {
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

  if (!joined) {
    return (
      <Shell>
        <section className="card space-y-4 p-5">
          <p className="text-xs uppercase tracking-widest text-white/40">Sala</p>
          <p className="text-4xl font-black tracking-[0.3em]">{code}</p>
          <input
            value={nickname}
            onChange={(e) => setTypedNickname(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && join()}
            maxLength={16}
            placeholder="Tu apodo"
            className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-4 outline-none placeholder:text-white/30 focus:border-fuchsia-400/60"
          />
          <button type="button" className="btn-primary w-full" onClick={join}>
            Entrar a la sala
          </button>
          {error && <p className="text-sm text-rose-300">{error}</p>}
        </section>
      </Shell>
    );
  }

  return (
    <Shell>
      <section className="card flex items-center justify-between gap-3 p-4">
        <div>
          <p className="text-xs uppercase tracking-widest text-white/40">Código</p>
          <p className="text-3xl font-black tracking-[0.3em]">{code}</p>
        </div>
        <button type="button" className="btn-ghost" onClick={shareLink}>
          {copied ? "¡Copiado!" : "Compartir link"}
        </button>
      </section>

      {state?.status === "lobby" && (
        <section className="card space-y-4 p-5">
          <p className="text-sm text-white/60">
            {state.players.length} en la sala. Esperando que el anfitrión arranque.
          </p>
          {isHost && (
            <>
              <div className="flex flex-wrap gap-2">
                {categories.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => getSocket().emit("set_config", { categoryId: c.id })}
                    className={`rounded-full border px-4 py-2 text-sm transition ${
                      c.id === state.categoryId
                        ? "border-fuchsia-400/70 bg-fuchsia-500/20"
                        : "border-white/12 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
              <div className="grid grid-cols-2 gap-2">
                {(["classic", "buzzer", "auction"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => getSocket().emit("set_config", { mode: m })}
                    className={`rounded-2xl border px-4 py-3 text-left text-sm transition ${
                      state.mode === m
                        ? "border-fuchsia-400/70 bg-fuchsia-500/20"
                        : "border-white/12 bg-white/5 hover:bg-white/10"
                    }`}
                  >
                    <span className="block font-bold">
                      {m === "classic" ? "⚡ Clásico" : m === "buzzer" ? "🔔 Buzzer" : "💰 Subasta"}
                    </span>
                    <span className="block text-xs text-white/50">
                      {m === "classic"
                        ? "Todos responden, gana la velocidad"
                        : m === "buzzer"
                          ? "El primero que aprieta corta el tema"
                          : "Apostás segundos: el más audaz escucha"}
                    </span>
                  </button>
                ))}
              </div>
              <label
                className={`flex items-center gap-3 text-sm text-white/70 ${
                  state.mode !== "classic" ? "opacity-40" : ""
                }`}
              >
                <input
                  type="checkbox"
                  disabled={state.mode !== "classic"}
                  checked={state.chaosEnabled}
                  onChange={(e) =>
                    getSocket().emit("set_config", { chaosEnabled: e.target.checked })
                  }
                  className="h-5 w-5 accent-fuchsia-500"
                />
                Ruleta de caos (Doble o Nada / Sin Voces)
              </label>
              <button
                type="button"
                className="btn-primary w-full"
                onClick={() => getSocket().emit("start_game")}
              >
                Arrancar {state.totalRounds} rondas
              </button>
            </>
          )}
        </section>
      )}

      {auction && (
        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
            <span>
              Ronda {auction.roundIndex + 1} / {auction.totalRounds}
            </span>
            <span className="tabular-nums">{(bidLeft / 1000).toFixed(1)}s</span>
          </div>
          <p className="rounded-2xl bg-amber-400/10 px-4 py-3 text-center text-sm text-amber-100">
            💰 {auction.hint}
          </p>
          <p className="text-center text-sm text-white/60">
            ¿En cuántos segundos la sacás? La apuesta más baja se lleva el turno.
          </p>
          <div className="grid grid-cols-6 gap-2">
            {Array.from({ length: auction.maxBid - auction.minBid + 1 }, (_, i) => auction.minBid + i).map(
              (s) => (
                <button
                  key={s}
                  type="button"
                  disabled={myBid !== null && s >= myBid}
                  onClick={() => placeBid(s)}
                  className={`rounded-2xl border py-3 text-lg font-black transition disabled:opacity-30 ${
                    myBid === s
                      ? "border-amber-400/70 bg-amber-500/25"
                      : "border-white/12 bg-white/5 hover:bg-white/10"
                  }`}
                >
                  {s}
                </button>
              ),
            )}
          </div>
          <ul className="space-y-1 text-sm">
            {[...bids]
              .sort((a, b) => a.seconds - b.seconds)
              .map((b) => (
                <li key={b.playerId} className="flex justify-between text-white/70">
                  <span>{b.name}</span>
                  <span className="tabular-nums">{b.seconds}s</span>
                </li>
              ))}
          </ul>
        </section>
      )}

      {auctionResult && !round && !auction && (
        <p className="text-center text-sm text-white/60">
          {auctionResult.name
            ? `${auctionResult.name} se la juega en ${auctionResult.seconds}s…`
            : "Nadie apostó, tema quemado"}
        </p>
      )}

      {round && (
        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
            <span>
              Ronda {round.roundIndex + 1} / {round.totalRounds}
            </span>
            <span className="tabular-nums">
              {isBuzzer ? "🔔 Buzzer" : isAuction ? `💰 ${round.bidSeconds}s` : `${(countdown / 1000).toFixed(1)}s`}
            </span>
          </div>
          {round.chaos !== "none" && (
            <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-center text-sm text-amber-200">
              {CHAOS_LABEL[round.chaos]}
            </p>
          )}
          <div className="rounded-2xl bg-black/30 p-2">
            <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#38bdf8" />
          </div>
          {status === "loading" && (!isAuction || wonAuction) && (
            <p className="text-center text-xs uppercase tracking-widest text-white/40">
              Cargando audio… te sumás desde donde va el tema
            </p>
          )}
          {status === "error" && (
            <p className="text-center text-xs text-rose-300">
              No pudimos cargar este tema en tu dispositivo · revisá la conexión
            </p>
          )}

          {isAuction ? (
            wonAuction ? (
              <>
                <p className="text-center text-sm text-amber-200">
                  Ganaste la subasta: {round.bidSeconds}s de audio. ¡Dale!
                </p>
                <OptionGrid
                  options={round.options}
                  onPick={pick}
                  pickedId={picked}
                  locked={Boolean(picked)}
                />
              </>
            ) : (
              <p className="rounded-2xl bg-amber-400/10 py-6 text-center text-lg font-bold text-amber-100">
                {auctionResult?.name ?? "Alguien"} se la juega en {round.bidSeconds}s…
              </p>
            )
          ) : isBuzzer ? (
            myBuzz ? (
              <>
                <p className="text-center text-sm text-emerald-300">
                  ¡Apretaste primero! Respondé en {(buzzLeft / 1000).toFixed(1)}s
                </p>
                <OptionGrid
                  options={round.options}
                  onPick={pick}
                  pickedId={picked}
                  locked={Boolean(picked)}
                />
              </>
            ) : buzz ? (
              <p className="rounded-2xl bg-sky-400/15 py-6 text-center text-lg font-bold text-sky-200">
                🔔 {buzz.name} está respondiendo…
              </p>
            ) : (
              <motion.button
                type="button"
                whileTap={{ scale: 0.94 }}
                disabled={iAmBlocked}
                onClick={hitBuzzer}
                className={`w-full rounded-3xl py-10 text-2xl font-black transition ${
                  iAmBlocked
                    ? "cursor-not-allowed bg-white/5 text-white/30"
                    : "bg-gradient-to-br from-fuchsia-500 to-sky-500 text-white shadow-lg shadow-fuchsia-500/30"
                }`}
              >
                {iAmBlocked ? "Fuera de este tema 🙊" : "¡LA SÉ! 🔔"}
              </motion.button>
            )
          ) : (
            <>
              <OptionGrid options={round.options} onPick={pick} pickedId={picked} locked={Boolean(picked)} />
              {picked && <p className="text-center text-sm text-white/50">Respuesta enviada ⏳</p>}
              {answered.length > 0 && (
                <p className="text-center text-xs text-white/40">Ya respondieron: {answered.join(", ")}</p>
              )}
            </>
          )}

          <div className="flex justify-center gap-2">
            {REACTIONS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                onClick={() => getSocket().emit("reaction", { emoji })}
                className="rounded-full border border-white/10 bg-white/5 px-3 py-1 text-lg transition hover:bg-white/15"
              >
                {emoji}
              </button>
            ))}
          </div>

          <div className="flex min-h-8 flex-wrap justify-center gap-2">
            <AnimatePresence>
              {reactions.map((r) => (
                <motion.span
                  key={r.id}
                  initial={{ opacity: 0, y: 12, scale: 0.6 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: -16 }}
                  className="rounded-full bg-white/10 px-3 py-1 text-sm"
                >
                  {r.emoji} {r.name}
                </motion.span>
              ))}
            </AnimatePresence>
          </div>
        </section>
      )}

      <AnimatePresence>
        {result && (
          <motion.section
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            className="card space-y-3 p-5"
          >
            <div className="flex items-center gap-3">
              {result.solution.artwork && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={result.solution.artwork} alt="" className="h-14 w-14 rounded-xl" />
              )}
              <div>
                <p className="font-bold">{result.solution.title}</p>
                <p className="text-sm text-white/60">{result.solution.artist}</p>
              </div>
            </div>
            <ul className="space-y-1 text-sm">
              {result.results.map((r) => (
                <li key={r.id} className="flex justify-between">
                  <span>
                    {r.correct ? "✅" : "❌"} {r.name}
                  </span>
                  <span className="tabular-nums text-white/60">
                    {r.points > 0 ? `+${r.points}` : "—"}
                    {r.ms !== null && r.correct ? ` · ${(r.ms / 1000).toFixed(1)}s` : ""}
                  </span>
                </li>
              ))}
            </ul>
            {!result.isLastRound && (
              <p className="text-center text-xs text-white/40">Próxima ronda en unos segundos…</p>
            )}
          </motion.section>
        )}
      </AnimatePresence>

      {state && state.players.length > 0 && (
        <section className="card space-y-2 p-5">
          <p className="text-xs uppercase tracking-widest text-white/40">
            {state.status === "finished" ? "Podio final" : "Tabla"}
          </p>
          <ol className="space-y-1 text-sm">
            {state.players.map((p, i) => (
              <li key={p.id} className="flex justify-between">
                <span>
                  {["🥇", "🥈", "🥉"][i] ?? `${i + 1}.`} {p.name}
                  {p.id === state.hostId ? " 👑" : ""}
                </span>
                <span className="tabular-nums font-semibold">{p.score}</span>
              </li>
            ))}
          </ol>
          {state.status === "finished" && (
            <div className="mt-3 space-y-2">
              <button
                type="button"
                className={votedRematch ? "btn-ghost w-full" : "btn-primary w-full"}
                onClick={() => getSocket().emit("rematch")}
              >
                {votedRematch ? "Pediste revancha ✔" : "Revancha 🔁"}
              </button>
              <p className="text-center text-xs text-white/45">
                {rematchVotes.length}/{state.players.length} quieren revancha
                {rematchVotes.length < state.players.length
                  ? " · arranca sola cuando estén todos"
                  : ""}
              </p>
              {isHost && (
                <button
                  type="button"
                  className="btn-ghost w-full"
                  onClick={() => getSocket().emit("start_game")}
                >
                  Arrancar ya (anfitrión)
                </button>
              )}
            </div>
          )}
        </section>
      )}

      {error && <p className="text-sm text-rose-300">{error}</p>}
    </Shell>
  );
}
