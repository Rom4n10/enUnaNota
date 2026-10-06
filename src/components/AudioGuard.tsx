"use client";

import { AnimatePresence, motion } from "motion/react";
import { VolumeX } from "lucide-react";
import { useEffect, useState } from "react";
import { audioLocked, unlockAudio } from "@/lib/useAudio";

export function AudioGuard() {
  const [locked, setLocked] = useState(false);

  useEffect(() => {
    const id = setInterval(() => setLocked(audioLocked()), 800);
    return () => clearInterval(id);
  }, []);

  return (
    <AnimatePresence>
      {locked && (
        <motion.button
          type="button"
          initial={{ y: 80, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          exit={{ y: 80, opacity: 0 }}
          transition={{ type: "spring", stiffness: 420, damping: 28 }}
          onClick={() => {
            unlockAudio();
            setLocked(false);
          }}
          className="fixed inset-x-4 bottom-4 z-50 mx-auto flex max-w-sm items-center justify-center gap-2 rounded-2xl bg-yellow px-4 py-3.5 text-sm font-extrabold text-ink shadow-[0_5px_0_#b38f00,0_20px_40px_-10px_rgba(0,0,0,0.8)]"
        >
          <VolumeX size={18} strokeWidth={2.6} />
          Tu navegador pausó el audio · Tocá para activarlo
        </motion.button>
      )}
    </AnimatePresence>
  );
}
