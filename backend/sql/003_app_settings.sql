-- Run ONCE in the Supabase SQL editor (the assets table pattern — no auto-create).
-- Key/value app settings. Currently holds the maintenance switch that
-- /api/status reports and the frontend gates on.

create table if not exists app_settings (
  key        text primary key,
  value      text not null,
  updated_at timestamptz not null default now()
);

insert into app_settings (key, value) values
  ('maintenance', 'off'),
  ('maintenance_message', '')
on conflict (key) do nothing;

-- Boot everyone to the maintenance page (takes effect on each client's next
-- status poll — within ~5 min, or instantly when a user refocuses the tab):
--   update app_settings set value='on', updated_at=now() where key='maintenance';
--   update app_settings set value='Back shortly — scheduled maintenance.',
--     updated_at=now() where key='maintenance_message';
--
-- Bring everyone back (clients auto-return within ~30s):
--   update app_settings set value='off', updated_at=now() where key='maintenance';
