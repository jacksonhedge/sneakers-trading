import type { Metadata } from "next";
import "../globals.css";

export const metadata: Metadata = {
  title: "O'Toole Terminal — Enterprise",
  description: "Prediction-market intelligence infrastructure for hedge funds, prop shops, and newsrooms. Per-chair Terminal + API access.",
};

export default function BusinessLayout({ children }: { children: React.ReactNode }) {
  return <div className="biz-root">{children}</div>;
}
