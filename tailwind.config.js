/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        background: "#0c0c0e",
        surface: "#1a1a1d",
        primary: "#3b82f6",
        secondary: "#64748b",
        accent: "#f59e0b",
        border: "#27272a",
      },
      backdropBlur: {
        xs: '2px',
      }
    },
  },
  plugins: [],
}
