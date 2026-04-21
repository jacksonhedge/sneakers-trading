import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "./footer";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Sneakers Terminal",
  description:
    "A trading terminal for prediction markets. Unified across Kalshi, Polymarket, ProphetX, CDNA, and the sportsbook hybrids.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-stone-900 font-mono">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
