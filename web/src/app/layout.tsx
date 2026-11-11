import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Suspense } from "react";
import { connection } from "next/server";
import "./globals.css";
import { Nav } from "./nav";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Horma · panel",
  description: "Panel de Horma: pipelines, ingesta y datos guardados",
};

export default async function RootLayout({ children }: LayoutProps<"/">) {
  // CSP con nonce (A2): Next solo pone el nonce de cada petición en los scripts si la página se pinta EN esa petición.
  // Una página prerrenderizada en la compilación no tiene nonce y el navegador bloquearía sus scripts. Horma es una web
  // con sesión en casi todo, así que pintar siempre en cada petición no cuesta nada que importe.
  await connection();
  return (
    <html
      lang="es"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-zinc-50 text-zinc-900">
        <Suspense fallback={<nav className="border-b border-zinc-200 bg-white px-6 py-3 text-sm font-semibold">Horma</nav>}><Nav /></Suspense>
        <main className="mx-auto w-full max-w-6xl flex-1 p-6">{children}</main>
      </body>
    </html>
  );
}
