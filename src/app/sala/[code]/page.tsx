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
import type { Category, RoomState, RoundEnd, RoundStart } from "@/lib/types";
import { usePreviewPlayer } from "@/lib/useAudio";
import { useProfile } from "@/lib/useProfile";

const CHAOS_LABEL: Record<string, string> = {
  double: "🎲 Doble o Nada · puntos x2",
  short: "🤫 Sin Voces · solo 2 segundos",
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
    };
    const onRoundEnd = (payload: RoundEnd) => {
      stop();
      setResult(payload);
      setRound(null);
    };
    const onAnswered = ({ name }: { name: string }) => setAnswered((a) => [...a, name]);
    const onError = ({ message }: { message: string }) => setError(message);
    const onConnect = () => syncClock();

    socket.on("connect", onConnect);
    socket.on("room_state", onState);
    socket.on("round_start", onRoundStart);
    socket.on("round_end", onRoundEnd);
    socket.on("player_answered", onAnswered);
    socket.on("error_msg", onError);
    return () => {
      socket.off("connect", onConnect);
      socket.off("room_state", onState);
      socket.off("round_start", onRoundStart);
      socket.off("round_end", onRoundEnd);
      socket.off("player_answered", onAnswered);
      socket.off("error_msg", onError);
    };
  }, [stop]);

  // Start playback exactly at the timestamp the server scheduled.
  useEffect(() => {
    if (!round || status !== "ready") return;
    const clipMs = round.chaos === "short" ? 2000 : null;
    const delay = round.startAt - serverNow();
    if (delay > 0) {
      const id = setTimeout(() => playClip(clipMs), delay);
      return () => clearTimeout(id);
    }
    playClip(clipMs, Math.min(25_000, -delay));
  }, [round, status, playClip]);

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
              <label className="flex items-center gap-3 text-sm text-white/70">
                <input
                  type="checkbox"
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
            <span className="tabular-nums">{(countdown / 1000).toFixed(1)}s</span>
          </div>
          {round.chaos !== "none" && (
            <p className="rounded-xl bg-amber-400/15 px-3 py-2 text-center text-sm text-amber-200">
              {CHAOS_LABEL[round.chaos]}
            </p>
          )}
          <div className="rounded-2xl bg-black/30 p-2">
            <Waveform active={status === "playing"} getAnalyser={getAnalyser} color="#38bdf8" />
          </div>
          <OptionGrid options={round.options} onPick={pick} pickedId={picked} locked={Boolean(picked)} />
          {picked && <p className="text-center text-sm text-white/50">Respuesta enviada ⏳</p>}
          {answered.length > 0 && (
            <p className="text-center text-xs text-white/40">Ya respondieron: {answered.join(", ")}</p>
          )}
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
