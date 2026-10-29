/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      // Mirrors the CSS variables in app/globals.css (taken from the card deck).
      colors: {
        bg: "#0e0f0f",
        surface: "#090a0a",
        ink: "#f3f3ed",
        muted: "#92958f",
        edge: "#757a72",
        line: "#2b2d2b",
        hi: "#c6c9c1",
        danger: "#d9776b",
      },
      fontFamily: {
        mono: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
        sans: ["var(--font-mono)", "ui-monospace", "SFMono-Regular", "Menlo", "monospace"],
      },
    },
  },
  plugins: [],
};
