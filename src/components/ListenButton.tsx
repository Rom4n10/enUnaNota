"use client";

import { LoaderCircle, Play, Square } from "lucide-react";
import type { Status } from "@/lib/useAudio";

type Props = {
  status: Status;
  label: string;
  onPlay: () => void;
  onStop?: () => void;
  className?: string;
};

export function ListenButton({ status, label, onPlay, onStop, className = "" }: Props) {
  const playing = status === "playing";
  const loading = status === "loading";
  return (
    <button
      type="button"
      disabled={loading || status === "error"}
      onClick={() => (playing && onStop ? onStop() : onPlay())}
      className={`btn-accent relative ${className}`}
    >
      <span className="relative grid h-7 w-7 place-items-center">
        {playing && (
          <>
            <span className="absolute inset-0 rounded-full bg-ink/40" style={{ animation: "ring 1.2s ease-out infinite" }} />
            <span className="absolute inset-0 rounded-full bg-ink/30" style={{ animation: "ring 1.2s ease-out 0.4s infinite" }} />
          </>
        )}
        <span className="relative grid h-7 w-7 place-items-center rounded-full bg-ink text-accent">
          {loading ? (
            <LoaderCircle size={15} className="animate-spin" />
          ) : playing && onStop ? (
            <Square size={12} fill="currentColor" />
          ) : (
            <Play size={14} fill="currentColor" className="translate-x-px" />
          )}
        </span>
      </span>
      {loading ? "Cargando…" : playing && onStop ? "Detener" : label}
    </button>
  );
}
