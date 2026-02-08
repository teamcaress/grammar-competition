/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        ink: "#0f172a",
        mist: "#e2e8f0",
        sand: "#f8fafc",
        accent: "#0ea5e9",
        success: "#16a34a",
        danger: "#dc2626"
      }
    }
  },
  plugins: []
};

