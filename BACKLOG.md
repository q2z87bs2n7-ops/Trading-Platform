# Backlog

- **Calendar UI tile** — `/api/calendar` exists and is wired in
  `api.ts`/`types.ts`; no UI surface yet.
- **Postgres persistence layer** — trade journal, server-side watchlists,
  analytics history. Replaces direct-Alpaca-only reads + `localStorage`
  prefs. Free tier (Supabase/Neon).
