import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx,mdx}"],
  theme: {
    extend: {
      fontFamily: {
        serif: ['"EB Garamond"', "Georgia", '"Times New Roman"', "serif"],
        sans: ["Inter", "ui-sans-serif", "system-ui", '"Segoe UI"', "sans-serif"],
      },
      colors: {
        onyx: {
          DEFAULT: "#0A0E1A",
          50: "#F4F4F6",
          100: "#E5E5EA",
          900: "#15192A",
          950: "#0A0E1A",
        },
        cream: {
          DEFAULT: "#F4F0E8",
          50: "#FBFAF6",
          100: "#F4F0E8",
        },
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
      },
      letterSpacing: {
        wordmark: "0.06em",
        tagline: "0.36em",
      },
    },
  },
  plugins: [],
};

export default config;
