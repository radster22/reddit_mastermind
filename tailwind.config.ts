import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}"
  ],
  theme: {
    extend: {
      colors: {
        slateInk: "#0f172a",
        sunset: "#f97316",
        dusk: "#334155",
        sand: "#f8fafc"
      }
    }
  },
  plugins: []
};

export default config;
