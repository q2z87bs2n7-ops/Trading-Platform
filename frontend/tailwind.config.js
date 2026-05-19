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
        "bg-elev": "var(--bg-elev)",
        panel: "var(--panel)",
        "panel-2": "var(--panel-2)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        pos: "var(--pos)",
        "pos-bg": "var(--pos-bg)",
        neg: "var(--neg)",
        "neg-bg": "var(--neg-bg)",
        accent: "var(--accent)",
        "accent-bg": "var(--accent-bg)",
        warn: "var(--warn)",
        // legacy aliases (zero-diff during migration)
        muted: "var(--muted)",
        green: "var(--green)",
        red: "var(--red)",
      },
    },
  },
  plugins: [],
};
