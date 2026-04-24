import type { Metadata } from "next";
import { Geist_Mono, Inter } from "next/font/google";
import "./globals.css";
import { Footer } from "./footer";

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  metadataBase: new URL("https://sneakersterminal.com"),
  title: "Sneakers Terminal",
  description: "The prediction market terminal for college students and recent grads.",
  openGraph: {
    title: "Sneakers Terminal",
    description: "The prediction market terminal for college students and recent grads.",
    url: "https://sneakersterminal.com",
    siteName: "Sneakers Terminal",
    type: "website",
    locale: "en_US",
  },
  twitter: {
    card: "summary_large_image",
    title: "Sneakers Terminal",
    description: "The prediction market terminal for college students and recent grads.",
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
      className={`${geistMono.variable} ${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col text-stone-900 font-sans">
        <div className="flex-1">{children}</div>
        <Footer />
      </body>
    </html>
  );
}
