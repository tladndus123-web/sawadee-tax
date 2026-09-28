-- Phone notifications without LINE (owner's request 2026-09-28): the browser's push subscription of each device
-- that turned them on. Each member sees and manages only their own devices; the server sends with the service key.
create table public.push_subscriptions (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  endpoint   text not null unique check (endpoint like 'https://%'),
  p256dh     text not null,
  auth       text not null,
  created_at timestamptz not null default now()
);
alter table public.push_subscriptions enable row level security;
create policy "own devices" on public.push_subscriptions for all
  using (user_id = auth.uid() and public.is_member())
  with check (user_id = auth.uid() and public.is_member());
