"use client";

import { AnimatePresence, motion } from "framer-motion";
import { useParams } from "next/navigation";
import { useEffect, useState, useSyncExternalStore } from "react";
import { Shell } from "@/components/Shell";
import { OptionGrid } from "@/components/OptionGrid";
import { Waveform } from "@/components/Waveform";
import { getCategories } from "@/lib/api";
import { getSocket, serverNow, socketIdSnapshot, subscribeSocketId, syncClock } from "@/lib/socket";
import { updateProfile } from "@/lib/storage";
import type {
  BuzzLock,
  BuzzResume,
  Category,
  Reaction,
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
  const [reactions, setReactions] = useState<Reaction[]>([]);
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
      setPlayback({
        at: payload.startAt,
        offsetMs: 0,
        clipMs: payload.chaos === "short" ? 2000 : null,
      });
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
    const onReaction = (payload: Reaction) => {
      setReactions((r) => [...r.slice(-6), payload]);
      setTimeout(() => setReactions((r) => r.filter((x) => x.id !== payload.id)), 2600);
    };
    const onAnswered = ({ name }: { name: string }) => setAnswered((a) => [...a, name]);
    const onError = ({ message }: { message: string }) => setError(message);
    const onConnect = () => syncClock();

    socket.on("connect", onConnect);
    socket.on("room_state", onState);
    socket.on("round_start", onRoundStart);
    socket.on("round_end", onRoundEnd);
    socket.on("player_answered", onAnswered);
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
      socket.off("buzz_lock", onBuzzLock);
      socket.off("buzz_resume", onBuzzResume);
      socket.off("reaction", onReaction);
      socket.off("error_msg", onError);
    };
  }, [stop]);

  // Start (or resume) playback exactly at the timestamp the server scheduled.
  useEffect(() => {
    if (!playback || status !== "ready") return;
    const delay = playback.at - serverNow();
    if (delay > 0) {
      const id = setTimeout(() => playClip(playback.clipMs, playback.offsetMs), delay);
      return () => clearTimeout(id);
    }
    playClip(playback.clipMs, Math.min(25_000, playback.offsetMs - delay));
  }, [playback, status, playClip]);

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

  function hitBuzzer() {
    getSocket().emit("buzz", {});
  }

  async function shareLink() {
    const url = `${window.location.origin}/sala/${code}`;
    const text = `¡Sumate a mi sala de En Una Nota! Código ${code}\n${url}`;
    if (navigator.share) {
      await navigator.share({ text }).catch(() => undefined);
      return;
    }
    await navigator.clipboard.writeText(text).catch(() => undefined);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  // The host is already inside the room right after creating it.
  const joined = manuallyJoined || state?.code === code;
  const isHost = Boolean(state && selfId && state.hostId === selfId);
  const isBuzzer = round?.mode === "buzzer";
  const myBuzz = Boolean(buzz && selfId && buzz.playerId === selfId);
  const iAmBlocked = Boolean(selfId && blocked.includes(selfId));

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
                {(["classic", "buzzer"] as const).map((m) => (
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
                      {m === "classic" ? "⚡ Clásico" : "🔔 Buzzer"}
                    </span>
                    <span className="block text-xs text-white/50">
                      {m === "classic"
                        ? "Todos responden, gana la velocidad"
                        : "El primero que aprieta corta el tema"}
                    </span>
                  </button>
                ))}
              </div>
              <label
                className={`flex items-center gap-3 text-sm text-white/70 ${
                  state.mode === "buzzer" ? "opacity-40" : ""
                }`}
              >
                <input
                  type="checkbox"
                  disabled={state.mode === "buzzer"}
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

      {round && (
        <section className="card space-y-4 p-5">
          <div className="flex items-center justify-between text-xs uppercase tracking-widest text-white/40">
            <span>
              Ronda {round.roundIndex + 1} / {round.totalRounds}
            </span>
            <span className="tabular-nums">
              {isBuzzer ? "🔔 Buzzer" : `${(countdown / 1000).toFixed(1)}s`}
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

          {isBuzzer ? (
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
          {state.status === "finished" && isHost && (
            <button
              type="button"
              className="btn-primary mt-3 w-full"
              onClick={() => getSocket().emit("start_game")}
            >
              Jugar otra vez
            </button>
          )}
        </section>
      )}

      {error && <p className="text-sm text-rose-300">{error}</p>}
    </Shell>
  );
}
