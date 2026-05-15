import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  darkMode: "class",
  theme: {
    extend: {
      fontFamily: {
        serif: ['Georgia', '"EB Garamond"', '"Times New Roman"', "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", '"Segoe UI"', "sans-serif"],
      },
      colors: {
        // Operativos
        bg: "#06080f",
        surface: "#0e1322",
        surface2: "#161c2e",
        // Acentos
        gold: {
          50: "#FFF6D5",
          100: "#F1CB7E",
          200: "#E0B868",
          300: "#C9A961",
          500: "#A88944",
          700: "#6E5520",
          800: "#4A3917",
          900: "#3F2F11",
        },
        ink: {
          DEFAULT: "#e8ecf3",
          muted: "rgba(232, 236, 243, 0.55)",
          dim: "rgba(232, 236, 243, 0.35)",
        },
      },
      letterSpacing: {
        wordmark: "0.06em",
        tagline: "0.18em",
        ultra: "0.36em",
      },
    },
  },
  plugins: [],
};

export default config;
