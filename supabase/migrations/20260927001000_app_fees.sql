-- Delivery-app commission (GP) rates per channel, in percent, e.g. {"grab": 30, "lineman": 30} (owner's request
-- 2026-09-27). Company-wide, so it lives on the one settings row: everyone reads, only admins change (existing RLS).
alter table public.company_settings
  add column app_fees jsonb not null default '{}' check (jsonb_typeof(app_fees) = 'object');
