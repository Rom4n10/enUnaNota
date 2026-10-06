import type { Metadata, Viewport } from "next";
import { Bricolage_Grotesque, Manrope } from "next/font/google";
import { AudioGuard } from "@/components/AudioGuard";
import "./globals.css";

const display = Bricolage_Grotesque({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-display-face",
  display: "swap",
});

const body = Manrope({
  subsets: ["latin"],
  variable: "--font-body",
  display: "swap",
});

export const metadata: Metadata = {
  title: "En Una Nota — adiviná la canción",
  description:
    "Adiviná canciones escuchando apenas una nota. Desafío diario, modo contrarreloj y salas con amigos.",
};

export const viewport: Viewport = {
  themeColor: "#0b0a12",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className={`h-full antialiased ${display.variable} ${body.variable}`}>
      <body className="min-h-full" suppressHydrationWarning>
        {children}
        <AudioGuard />
      </body>
    </html>
  );
}
