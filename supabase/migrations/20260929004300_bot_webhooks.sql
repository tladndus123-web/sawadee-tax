-- Grok Bot reacting the moment something happens in the books (owner, 2026-11-08: "최대한 활용"): a Grok Bot routine
-- started "when a webhook is triggered" has a URL and a key; an owner pastes them in settings, and the site posts an
-- event there (a staff expense claim, a receipt worth a look) with "Authorization: Bearer <key>". Server only.

create table public.bot_webhooks (
  id           uuid primary key default gen_random_uuid(),
  name         text not null check (length(trim(name)) between 1 and 60),
  url          text not null check (url ~ '^https://\S+$' and length(url) <= 500),
  key          text not null check (length(key) between 8 and 300),
  created_by   uuid references auth.users (id) on delete set null,
  created_at   timestamptz not null default now(),
  last_sent_at timestamptz,
  last_status  int,
  enabled      boolean not null default true
);
alter table public.bot_webhooks enable row level security;
revoke all on public.bot_webhooks from anon, authenticated;
