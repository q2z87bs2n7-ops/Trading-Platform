import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Root VERSION file is the single source of truth; surface it in the GUI
// at build time (works for both the Vercel and GitHub Pages builds).
const appVersion = readFileSync(
  new URL("../VERSION", import.meta.url),
  "utf8",
).trim();

// Proxy API calls to the FastAPI backend in dev so the frontend can use
// same-origin relative URLs.
// Relative base so the same build works at the domain root (Vercel prod)
// and inside a per-branch subfolder on GitHub Pages.
export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
