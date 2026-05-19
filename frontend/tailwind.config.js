/** @type {import('tailwindcss').Config} */
// Phase B migration. Preflight is intentionally OFF: the not-yet-migrated
// components still rely on browser defaults plus the Phase A index.css,
// and Tailwind's global reset would regress them. Re-enable only once the
// whole app is on utilities.
export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  corePlugins: { preflight: false },
  theme: {
    extend: {
      colors: {
        bg: "var(--bg)",
        panel: "var(--panel)",
        border: "var(--border)",
        text: "var(--text)",
        muted: "var(--muted)",
        green: "var(--green)",
        red: "var(--red)",
      },
    },
  },
  plugins: [],
};
