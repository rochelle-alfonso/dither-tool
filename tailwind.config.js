/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,ts,jsx,tsx}"],
  theme: {
    extend: {
      colors: {
        panel: "#1e1e1e",
        surface: "#171717",
        track: "#3a3a3a",
        accent: "#0a84ff",
      },
    },
  },
  plugins: [],
};
