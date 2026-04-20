import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "O'Toole Terminal — Prediction Markets",
  description: "Live prediction markets terminal — Kalshi, Polymarket and more, with O'Toole AI.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" data-theme="light">
      <head>
        <link
          href="https://fonts.googleapis.com/css2?family=DM+Sans:opsz,wght@9..40,300;9..40,400;9..40,500;9..40,600;9..40,700&family=Orbitron:wght@700;900&family=Share+Tech+Mono&display=swap"
          rel="stylesheet"
        />
      </head>
      <body data-mode="medium">{children}</body>
    </html>
  );
}
