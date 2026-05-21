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
        "panel-3": "var(--panel-3)",
        border: "var(--border)",
        "border-strong": "var(--border-strong)",
        "border-2": "var(--border-2)",
        hairline: "var(--hairline)",
        text: "var(--text)",
        "text-2": "var(--text-2)",
        "text-3": "var(--text-3)",
        mute: "var(--mute)",
        pos: "var(--pos)",
        "pos-bg": "var(--pos-bg)",
        neg: "var(--neg)",
        "neg-bg": "var(--neg-bg)",
        accent: "var(--accent)",
        "accent-2": "var(--accent-2)",
        "accent-bg": "var(--accent-bg)",
        "accent-soft": "var(--accent-soft)",
        warn: "var(--warn)",
        "warn-bg": "var(--warn-bg)",
        "cb-accent": "var(--cb-accent)",
        "cb-accent-2": "var(--cb-accent-2)",
        "cb-accent-bg": "var(--cb-accent-bg)",
        "cb-accent-soft": "var(--cb-accent-soft)",
        // legacy aliases (zero-diff during migration)
        muted: "var(--muted)",
        green: "var(--green)",
        red: "var(--red)",
      },
      borderRadius: {
        card: "var(--r)",
        "card-lg": "var(--r-lg)",
        "card-xl": "var(--r-xl)",
      },
      boxShadow: {
        "elev-sm": "var(--shadow-sm)",
        elev: "var(--shadow)",
        "elev-lg": "var(--shadow-lg)",
      },
      fontFamily: {
        sans: [
          '"Plus Jakarta Sans"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Segoe UI"',
          "system-ui",
          "sans-serif",
        ],
        mono: [
          '"IBM Plex Mono"',
          "ui-monospace",
          '"SF Mono"',
          "Menlo",
          "Consolas",
          "monospace",
        ],
      },
    },
  },
  plugins: [],
};
