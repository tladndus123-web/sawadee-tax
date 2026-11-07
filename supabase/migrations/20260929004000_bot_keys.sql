-- Grok Bot (or another AI agent) connected to the books (owner, 2026-11-08: "설정에서 GROK BOT 연결 … 하루하루 총합해서
--안내 … 예약도"): an owner makes a key in settings; the agent sends it to /api/mcp and may read the books' summaries and
-- put dates in the tax calendar — nothing else. Only a SHA-256 of the key is kept; the key is shown once.
-- Server only: RLS on, no policies; the app reaches it through /api/bot-keys (owners).

create table public.bot_keys (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 40),
  key_hash     text not null unique check (key_hash ~ '^[0-9a-f]{64}$'),
  -- the first characters, so the owner can tell keys apart ("sk_sawa_Ab12…")
  hint         text not null check (length(hint) between 4 and 20),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  last_used_at timestamptz,
  revoked_at   timestamptz
);
alter table public.bot_keys enable row level security;
revoke all on public.bot_keys from anon, authenticated;

-- Dates the agent puts in the calendar are marked as its own (it may remove only those)
alter table public.calendar_events drop constraint calendar_events_source_check;
alter table public.calendar_events add constraint calendar_events_source_check check (source in ('typed', 'document', 'recurring', 'bot'));
