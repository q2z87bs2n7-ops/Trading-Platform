-- Run ONCE in the Supabase SQL editor (the assets table pattern — no auto-create).
-- Key/value app settings read by /api/status and gated on by the frontend.
-- Two independent switches:
--   maintenance  — graceful page; clients auto-recover when flipped off (~30s).
--   force_stop   — terminal boot; clients show a page, STOP all polling, and only
--                  return on a manual browser reload (no auto-recovery).

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('maintenance', 'off'),
  ('maintenance_message', ''),
  ('force_stop', 'off'),
  ('force_stop_message', '')
on conflict (key) do nothing;

-- Lock the public PostgREST/anon API out. The backend uses a direct postgres
-- (owner) connection, which BYPASSES RLS, so reads/writes keep working; the
-- Supabase SQL editor also runs as postgres, so the toggle commands below work.
alter table app_settings enable row level security;

-- ── Graceful maintenance (auto-recovers) ────────────────────────────────────
-- ON (optional message):
--   update app_settings set value='on', updated_at=now() where key='maintenance';
--   update app_settings set value='Back shortly — scheduled maintenance.',
--     updated_at=now() where key='maintenance_message';
-- OFF (clients auto-return within ~30s):
--   update app_settings set value='off', updated_at=now() where key='maintenance';

-- ── Force-stop / terminal boot (manual reload to return) ─────────────────────
-- ON (optional message) — clients show the page and go silent (no more polling):
--   update app_settings set value='on', updated_at=now() where key='force_stop';
--   update app_settings set value='You have been disconnected.',
--     updated_at=now() where key='force_stop_message';
-- OFF — does NOT bring booted tabs back (they stopped listening); they return
-- only when the user reloads. Set off so fresh loads aren't re-booted:
--   update app_settings set value='off', updated_at=now() where key='force_stop';
