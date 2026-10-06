import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { CSSProperties, ReactNode } from "react";
import { Logo } from "@/components/Logo";

type Props = {
  children: ReactNode;
  back?: boolean;
  wide?: boolean;
  style?: CSSProperties;
};

export function Shell({ children, back = true, wide = false, style }: Props) {
  return (
    <main
      style={style}
      className={`mx-auto flex min-h-dvh w-full flex-col gap-5 px-4 pb-10 pt-5 sm:gap-6 sm:px-6 sm:pt-8 ${
        wide ? "max-w-5xl" : "max-w-2xl"
      }`}
    >
      <header className="flex items-center justify-between">
        <Link href="/" className="group flex items-center gap-2.5">
          <Logo />
          <span className="font-display text-xl font-extrabold">
            En Una <span className="text-lime">Nota</span>
          </span>
        </Link>
        {back && (
          <Link
            href="/"
            className="group flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3.5 py-2 text-sm font-bold text-white/70 transition hover:border-white/25 hover:text-white"
          >
            <ArrowLeft size={16} className="transition-transform group-hover:-translate-x-0.5" />
            Modos
          </Link>
        )}
      </header>
      {children}
    </main>
  );
}
