import type { Metadata, Viewport } from "next";
import { AudioGuard } from "@/components/AudioGuard";
import "./globals.css";

export const metadata: Metadata = {
  title: "En Una Nota — adiviná la canción",
  description:
    "Adiviná canciones escuchando apenas una nota. Desafío diario, modo contrarreloj y salas con amigos.",
};

export const viewport: Viewport = {
  themeColor: "#07060f",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" className="h-full antialiased">
      <body className="min-h-full" suppressHydrationWarning>
        {children}
        <AudioGuard />
      </body>
    </html>
  );
}
