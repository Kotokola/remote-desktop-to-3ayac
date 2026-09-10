/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,ts,jsx,tsx,mdx}", "./components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        bg: "#050510",
        card: "#0a0a1f",
        cardHover: "#12122e",
        border: "#1e1e4a",
        neon: "#00f0ff",
        neonPink: "#ff00a0",
        neonPurple: "#7a00ff",
        dim: "#6b6bb8",
      },
      fontFamily: {
        cyber: ["JetBrains Mono", "monospace"],
        display: ["Orbitron", "sans-serif"],
      },
      boxShadow: {
        neon: "0 0 20px rgba(0,240,255,0.5), 0 0 40px rgba(0,240,255,0.2)",
        neonPink: "0 0 20px rgba(255,0,160,0.5)",
      },
      animation: {
        flicker: "flicker 3s infinite",
        scan: "scan 8s linear infinite",
        pulseNeon: "pulseNeon 2s ease-in-out infinite",
      },
      keyframes: {
        flicker: {
          "0%, 100%": { opacity: 1 },
          "50%": { opacity: 0.8 },
        },
        scan: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(100%)" },
        },
        pulseNeon: {
          "0%, 100%": { boxShadow: "0 0 10px rgba(0,240,255,0.4)" },
          "50%": { boxShadow: "0 0 30px rgba(0,240,255,0.8)" },
        },
      },
    },
  },
  plugins: [],
};
