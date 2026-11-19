-- "문제없음" on the duplicates popup (owner 2026-11-19): an admin says a possible duplicate is fine, and nobody is asked
-- about it again. One row per duplicate (key = what was compared: "doc:<seller tax ID>|<doc no>|<ids>" or
-- "sale:<id>|<id>"); a new copy makes a new key, so it is asked about again. Admins read and add; nobody edits.
create table if not exists public.dup_acks (
  key        text primary key check (char_length(key) between 5 and 2000),
  created_by uuid default auth.uid() references auth.users (id) on delete set null,
  created_at timestamptz not null default now()
);
alter table public.dup_acks enable row level security;
drop policy if exists "admins read dup acks" on public.dup_acks;
create policy "admins read dup acks" on public.dup_acks for select to authenticated using (public.is_admin());
drop policy if exists "admins add dup acks" on public.dup_acks;
create policy "admins add dup acks" on public.dup_acks for insert to authenticated with check (public.is_admin() and created_by = auth.uid());
grant select, insert on public.dup_acks to authenticated;
