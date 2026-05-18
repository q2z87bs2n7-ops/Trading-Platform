import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Proxy API calls to the FastAPI backend in dev so the frontend can use
// same-origin relative URLs.
// Relative base so the same build works at the domain root (Vercel prod)
// and inside a per-branch subfolder on GitHub Pages.
export default defineConfig({
  base: "./",
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
