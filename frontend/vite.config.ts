/// <reference types="vitest/config" />
import { readFileSync } from "node:fs";
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Root VERSION file is the single source of truth; surface it in the GUI
// at build time (works for both the Vercel and GitHub Pages builds).
const appVersion = readFileSync(
  new URL("../VERSION", import.meta.url),
  "utf8",
).trim();

// Relative base so the same build works at the domain root (Vercel prod)
// and inside a per-branch subfolder on GitHub Pages.
export default defineConfig({
  base: "./",
  define: {
    __APP_VERSION__: JSON.stringify(appVersion),
  },
  plugins: [
    react(),
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Trading Platform",
        short_name: "Trading",
        description:
          "Paper trading platform on the Alpaca API with real-time market data and portfolio management",
        theme_color: "#000000",
        background_color: "#ffffff",
        display: "standalone",
        scope: "./",
        start_url: "./",
        icons: [
          {
            src: "icon.svg",
            sizes: "any",
            type: "image/svg+xml",
            purpose: "any",
          },
        ],
        categories: ["finance", "productivity"],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,svg,png,jpg,jpeg,gif,woff,woff2}",
        ],
        globIgnores: ["**/charting_library/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          // Live market data must never be served from cache.
          // NetworkOnly passes straight through — no timeout race, no stale quotes.
          {
            urlPattern: ({ url, sameOrigin }: { url: URL; sameOrigin: boolean }) =>
              sameOrigin && url.pathname.startsWith("/api/"),
            handler: "NetworkOnly",
          },
          {
            urlPattern: /charting_library/i,
            handler: "CacheFirst",
            options: {
              cacheName: "charting-library-cache",
              expiration: {
                maxEntries: 10,
                maxAgeSeconds: 86400,
              },
            },
          },
        ],
      },
    }),
  ],
  server: {
    port: 5173,
    // Proxy API calls to the FastAPI backend in dev so the frontend can use
    // same-origin relative URLs.
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
  test: {
    // Pure functions — no DOM needed.
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
