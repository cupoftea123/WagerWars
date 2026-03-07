import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eff6ff",
          500: "#3b82f6",
          600: "#2563eb",
          700: "#1d4ed8",
        },
        accent: {
          400: "#f59e0b",
          500: "#d97706",
        },
        danger: {
          500: "#ef4444",
          600: "#dc2626",
        },
        success: {
          500: "#22c55e",
          600: "#16a34a",
        },
      },
      animation: {
        "fade-in-up": "fade-in-up 0.6s ease-out forwards",
        "fade-in-up-delay": "fade-in-up 0.6s ease-out 0.2s forwards",
        "fade-in-up-delay-2": "fade-in-up 0.6s ease-out 0.4s forwards",
        "pulse-glow": "pulse-glow 2s ease-in-out infinite",
        "energy-appear": "energy-orb-appear 0.3s ease-out forwards",
        "energy-pulse": "energy-orb-pulse 2s ease-in-out infinite",
        "timer-pulse": "timer-pulse 1s ease-in-out infinite",
        "confetti": "confetti-fall var(--confetti-duration, 3s) linear forwards",
      },
      keyframes: {
        "fade-in-up": {
          "0%": { opacity: "0", transform: "translateY(20px)" },
          "100%": { opacity: "1", transform: "translateY(0)" },
        },
        "pulse-glow": {
          "0%, 100%": { boxShadow: "0 0 20px rgba(239, 68, 68, 0.3)" },
          "50%": { boxShadow: "0 0 40px rgba(239, 68, 68, 0.6)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
