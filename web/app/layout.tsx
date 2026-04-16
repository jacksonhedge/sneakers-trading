import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "SNEAKERS — Sports Betting Terminal",
  description:
    "Bloomberg-style terminal for sports betting odds, prediction markets, arbitrage, and +EV scanning.",
  icons: {
    icon: "/favicon.ico",
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="bg-bg-base">
      <body className="min-h-screen bg-bg-base text-neutral-strong antialiased selection:bg-accent/30 selection:text-white">
        {children}
      </body>
    </html>
  );
}
