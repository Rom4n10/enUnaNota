"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { Shell } from "@/components/Shell";
import { getCategories } from "@/lib/api";
import { getSocket } from "@/lib/socket";
import { updateProfile } from "@/lib/storage";
import type { Category } from "@/lib/types";
import { useProfile } from "@/lib/useProfile";

export default function SalaLobbyPage() {
  const router = useRouter();
  const stored = useProfile().nickname;
  const [typedNickname, setTypedNickname] = useState<string | null>(null);
  const nickname = typedNickname ?? stored;
  const [code, setCode] = useState("");
  const [categoryId, setCategoryId] = useState("pop-global");
  const [categories, setCategories] = useState<Category[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    getCategories().then(setCategories).catch(() => setCategories([]));
  }, []);

  function create() {
    if (!nickname.trim()) return setError("Poné un apodo");
    setBusy(true);
    updateProfile({ nickname: nickname.trim() });
    getSocket().emit(
      "create_room",
      { name: nickname.trim(), categoryId },
      (res: { ok: boolean; code?: string; error?: string }) => {
        setBusy(false);
        if (res.ok && res.code) router.push(`/sala/${res.code}`);
        else setError(res.error ?? "No pudimos crear la sala");
      },
    );
  }

  function join() {
    if (!nickname.trim()) return setError("Poné un apodo");
    if (code.trim().length !== 4) return setError("El código tiene 4 letras");
    updateProfile({ nickname: nickname.trim() });
    router.push(`/sala/${code.trim().toUpperCase()}`);
  }

  return (
    <Shell>
      <section className="card space-y-4 p-5">
        <h1 className="text-2xl font-black">🎉 Sala de Amigos</h1>
        <p className="text-sm text-white/60">
          De 2 a 12 jugadores. El audio arranca al mismo tiempo para todos y el puntaje baja
          mientras más tardás en apretar.
        </p>
        <input
          value={nickname}
          onChange={(e) => setTypedNickname(e.target.value)}
          maxLength={16}
          placeholder="Tu apodo"
          className="w-full rounded-2xl border border-white/12 bg-white/5 px-4 py-4 outline-none placeholder:text-white/30 focus:border-fuchsia-400/60"
        />
      </section>

      <section className="card space-y-3 p-5">
        <p className="text-xs uppercase tracking-widest text-white/40">Crear sala</p>
        <div className="flex flex-wrap gap-2">
          {categories.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => setCategoryId(c.id)}
              className={`rounded-full border px-4 py-2 text-sm transition ${
                c.id === categoryId
                  ? "border-fuchsia-400/70 bg-fuchsia-500/20"
                  : "border-white/12 bg-white/5 hover:bg-white/10"
              }`}
            >
              {c.emoji} {c.name}
            </button>
          ))}
        </div>
        <button type="button" className="btn-primary w-full" disabled={busy} onClick={create}>
          Crear sala
        </button>
      </section>

      <section className="card space-y-3 p-5">
        <p className="text-xs uppercase tracking-widest text-white/40">Unirse con código</p>
        <div className="flex gap-3">
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            placeholder="ABCD"
            className="w-36 rounded-2xl border border-white/12 bg-white/5 px-4 py-4 text-center text-2xl font-black tracking-[0.4em] outline-none placeholder:text-white/20 focus:border-fuchsia-400/60"
          />
          <button type="button" className="btn-ghost flex-1" onClick={join}>
            Entrar
          </button>
        </div>
      </section>

      {error && <p className="text-sm text-rose-300">{error}</p>}
    </Shell>
  );
}
