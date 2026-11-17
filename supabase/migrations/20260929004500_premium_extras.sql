-- Restaurant extras' switches (owner 2026-11-18: "음식점 기능은 설정에 넣어두고 나중에 켤 수 있도록"):
-- {"delivery": bool, "prep": bool, "waste": bool}; all off by default. Added only (nothing renamed or removed).
-- The row's existing policies apply: everyone reads company_settings, admins update it.
alter table public.company_settings add column if not exists extras jsonb not null default '{}'::jsonb check (jsonb_typeof(extras) = 'object');
