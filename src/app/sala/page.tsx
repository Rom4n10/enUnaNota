"use client";

import { LoaderCircle, LogIn, Plus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { CategoryPicker } from "@/components/CategoryPicker";
import { ModeHeader } from "@/components/ModeHeader";
import { Shell } from "@/components/Shell";
import { accentStyle, modeOf } from "@/lib/modes";
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
    <Shell style={accentStyle(modeOf("sala").color)}>
      <ModeHeader id="sala">
        De 2 a 12 jugadores. El audio arranca al mismo tiempo para todos y el puntaje baja mientras más tardás en
        apretar.
      </ModeHeader>

      <section className="card space-y-3 p-5 sm:p-6">
        <p className="eyebrow">Tu apodo</p>
        <input
          value={nickname}
          onChange={(e) => setTypedNickname(e.target.value)}
          maxLength={16}
          placeholder="¿Cómo te llaman?"
          className="field text-lg"
        />
      </section>

      <div className="grid gap-5 sm:grid-cols-[1.4fr_1fr] sm:gap-6">
        <section className="card space-y-4 p-5 sm:p-6">
          <CategoryPicker categories={categories} value={categoryId} onChange={setCategoryId} label="Crear sala" />
          <button type="button" className="btn-accent w-full text-lg" disabled={busy} onClick={create}>
            {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Plus size={20} strokeWidth={2.8} />}
            Crear sala
          </button>
        </section>

        <section className="card flex flex-col gap-3 p-5 sm:p-6">
          <p className="eyebrow">Unirse con código</p>
          <input
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase().slice(0, 4))}
            onKeyDown={(e) => e.key === "Enter" && join()}
            placeholder="ABCD"
            className="field text-center font-display text-3xl font-extrabold tracking-[0.4em] placeholder:text-white/15"
          />
          <button type="button" className="btn-ghost mt-auto w-full" onClick={join}>
            <LogIn size={18} strokeWidth={2.6} />
            Entrar
          </button>
        </section>
      </div>

      {error && <p className="text-sm font-semibold text-coral">{error}</p>}
    </Shell>
  );
}
