import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        bg: {
          base: "#0D0D14",
          surface: "#13131A",
          elevated: "#191923",
          overlay: "#1C1C27",
        },
        border: {
          DEFAULT: "#1E1E2A",
          strong: "#2A2A3A",
        },
        accent: {
          DEFAULT: "#00FF88",
          dim: "#00cc6d",
          glow: "rgba(0, 255, 136, 0.12)",
        },
        danger: {
          DEFAULT: "#FF3B5C",
          dim: "#c7304a",
        },
        neutral: {
          data: "#8E8E9A",
          strong: "#E4E4EC",
          mid: "#5A5A66",
          faint: "#3A3A46",
        },
      },
      fontFamily: {
        mono: [
          "ui-monospace",
          "SF Mono",
          "SFMono-Regular",
          "Menlo",
          "Monaco",
          "Consolas",
          "monospace",
        ],
        sans: [
          "-apple-system",
          "BlinkMacSystemFont",
          "Inter",
          "SF Pro Text",
          "Segoe UI",
          "sans-serif",
        ],
      },
      fontSize: {
        "2xs": ["10px", "12px"],
        xs: ["11px", "14px"],
        sm: ["12px", "16px"],
        base: ["13px", "18px"],
        md: ["14px", "20px"],
        lg: ["16px", "22px"],
      },
      letterSpacing: {
        terminal: "0.04em",
        wide2: "0.08em",
      },
      boxShadow: {
        cell: "inset 0 -1px 0 #1E1E2A",
        menu: "0 20px 60px -20px rgba(0,0,0,0.8), 0 0 0 1px #1E1E2A",
        glow: "0 0 0 1px rgba(0,255,136,0.35), 0 0 24px rgba(0,255,136,0.15)",
      },
      animation: {
        "pulse-live": "pulseLive 1.8s ease-in-out infinite",
        "fade-in": "fadeIn 120ms ease-out",
        "slide-down": "slideDown 180ms cubic-bezier(0.2, 0.8, 0.2, 1)",
        ticker: "ticker 40s linear infinite",
      },
      keyframes: {
        pulseLive: {
          "0%, 100%": { opacity: "1", transform: "scale(1)" },
          "50%": { opacity: "0.55", transform: "scale(0.85)" },
        },
        fadeIn: {
          "0%": { opacity: "0" },
          "100%": { opacity: "1" },
        },
        slideDown: {
          "0%": { opacity: "0", transform: "translateY(-4px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        ticker: {
          "0%": { transform: "translateX(0)" },
          "100%": { transform: "translateX(-50%)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
