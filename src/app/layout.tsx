import type { Metadata } from "next";
import "./globals.css";

// TODO: adotar Cache Components e remover esta saída temporária.
// Guia: https://nextjs.org/docs/app/guides/migrating-to-cache-components
export const instant = false;

export const metadata: Metadata = {
  title: "Voz Local — transforme texto na sua voz",
  description:
    "Síntese de voz local em português do Brasil usando uma amostra da sua própria voz.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
