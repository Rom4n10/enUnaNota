import Link from "next/link";
import type { ReactNode } from "react";

export function Shell({ children, back = true }: { children: ReactNode; back?: boolean }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-3xl flex-col gap-6 px-4 py-6 sm:py-10">
      <header className="flex items-center justify-between">
        <Link href="/" className="flex items-center gap-2 text-lg font-black tracking-tight">
          <span className="text-2xl">🎵</span>
          <span>
            En Una <span className="text-fuchsia-400">Nota</span>
          </span>
        </Link>
        {back && (
          <Link href="/" className="text-sm text-white/50 transition hover:text-white">
            ← Modos
          </Link>
        )}
      </header>
      {children}
    </main>
  );
}
