import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import "./globals.css";
import { Footer } from "./footer";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sneakersterminal.com"),
  title: "Sneakers Terminal",
  description: "Your personal trading terminal — on the go.",
  openGraph: {
    title: "Sneakers Terminal",
    description: "Your personal trading terminal — on the go.",
    url: "https://sneakersterminal.com",
    siteName: "Sneakers Terminal",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sneakers Terminal",
    description: "Your personal trading terminal — on the go.",
  },
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
