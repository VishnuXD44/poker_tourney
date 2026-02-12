/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    "./app/**/*.{js,ts,jsx,tsx}",
    "./components/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        gold: "#b8860b",
        "gold-light": "#d4af37",
        "gold-bright": "#e8c547",
        navy: "#1a2744",
        "navy-muted": "#2d3a5a",
        "surface-alt": "#fafaf9",
      },
      fontFamily: {
        sans: ["Outfit", "system-ui", "sans-serif"],
        display: ["Cormorant Garamond", "Georgia", "serif"],
        mono: ["JetBrains Mono", "monospace"],
      },
    },
  },
  plugins: [],
};
