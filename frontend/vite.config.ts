import { readFileSync } from "node:fs";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

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
            src: "pwa-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "any",
          },
          {
            src: "pwa-maskable-192x192.png",
            sizes: "192x192",
            type: "image/png",
            purpose: "maskable",
          },
          {
            src: "pwa-maskable-512x512.png",
            sizes: "512x512",
            type: "image/png",
            purpose: "maskable",
          },
        ],
        categories: ["finance", "productivity"],
        screenshots: [
          {
            src: "screenshot-narrow.png",
            sizes: "540x720",
            type: "image/png",
            form_factor: "narrow",
          },
          {
            src: "screenshot-wide.png",
            sizes: "1280x720",
            type: "image/png",
            form_factor: "wide",
          },
        ],
      },
      workbox: {
        globPatterns: [
          "**/*.{js,css,html,svg,png,jpg,jpeg,gif,woff,woff2}",
        ],
        globIgnores: ["**/charting_library/**"],
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\..*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300,
              },
            },
          },
          {
            urlPattern: /^\/api\/.*/i,
            handler: "NetworkFirst",
            options: {
              cacheName: "local-api-cache",
              networkTimeoutSeconds: 10,
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 300,
              },
            },
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
    proxy: {
      "/api": "http://localhost:8000",
    },
  },
});
