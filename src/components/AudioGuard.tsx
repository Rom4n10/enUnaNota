"use client";

import { useEffect, useState } from "react";
import { audioLocked, unlockAudio } from "@/lib/useAudio";

/** Offers a one-tap unlock when the browser keeps the AudioContext suspended. */
export function AudioGuard() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setLocked(audioLocked()), 800);
    return () => clearInterval(id);
  }, []);

  if (!locked) return null;
  return (
    <button
      type="button"
      onClick={() => {
        unlockAudio();
        setLocked(false);
      }}
      className="fixed inset-x-4 bottom-4 z-50 mx-auto max-w-sm rounded-2xl bg-amber-400 px-4 py-3 text-sm font-black text-black shadow-xl"
    >
      🔇 Tu navegador pausó el audio · Tocá para activarlo
    </button>
  );
}
