import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: { DEFAULT: "#6366F1", 50: "#EEF2FF", 100: "#E0E7FF", 200: "#C7D2FE", 500: "#6366F1", 600: "#4F46E5", 700: "#4338CA" },
        secondary: "#818CF8",
        cta: { DEFAULT: "#10B981", 50: "#ECFDF5", 100: "#D1FAE5", 600: "#059669" },
        ink: "#1E1B4B",
        canvas: "#F5F3FF",
        muted: "#6B7280",
      },
      fontFamily: {
        sans: ["'Plus Jakarta Sans'", "system-ui", "sans-serif"],
        mono: ["'Fira Code'", "monospace"],
      },
      boxShadow: {
        soft: "0 2px 8px 0 rgba(99,102,241,0.08), 0 1px 3px 0 rgba(0,0,0,0.06)",
        "soft-md": "0 4px 16px 0 rgba(99,102,241,0.12), 0 2px 6px 0 rgba(0,0,0,0.06)",
        "soft-lg": "0 8px 32px 0 rgba(99,102,241,0.15), 0 4px 12px 0 rgba(0,0,0,0.08)",
        card: "0 1px 4px 0 rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04)",
      },
      backgroundImage: {
        "gradient-brand": "linear-gradient(135deg, #6366F1 0%, #4F46E5 100%)",
        "gradient-canvas": "linear-gradient(180deg, #F5F3FF 0%, #EEF2FF 100%)",
        "dot-pattern": "radial-gradient(circle, #C7D2FE 1px, transparent 1px)",
      },
      animation: {
        "fade-in": "fadeIn 0.2s ease-out",
        "slide-up": "slideUp 0.25s ease-out",
      },
      keyframes: {
        fadeIn: { "0%": { opacity: "0" }, "100%": { opacity: "1" } },
        slideUp: { "0%": { opacity: "0", transform: "translateY(8px)" }, "100%": { opacity: "1", transform: "translateY(0)" } },
      },
    },
  },
  plugins: [],
};
export default config;
