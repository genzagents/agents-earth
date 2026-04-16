/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        genz: {
          bg: "#0f172a",
          surface: "#1e293b",
          border: "#334155",
          accent: "#6366f1",
          green: "#22c55e",
          red: "#ef4444",
          yellow: "#eab308",
        },
      },
    },
  },
  plugins: [],
};
