-- Expenses and calendar upgrade (owner, 2026-11-06).
-- ai_notes: what the AI wrote, kept so the same thing is not asked (and paid for) again — the month's expense report
-- with a line per claim, the week's to-do briefing. `stamp` says what it was made from (when that changes, it is made
-- again). Admins read it; only the server writes it (service role).
-- calendar_feed: the secret address of the calendar subscription (Google / iPhone calendar, iCal). Admins get or
-- renew it with calendar_feed_token(); whoever has the address reads the deadlines, so it can be renewed any time.
-- Adds two tables and a function; no data changes.

create table public.ai_notes (
  key text primary key check (length(key) between 1 and 120),
  body jsonb not null,
  stamp text not null default '',
  made_at timestamptz not null default now()
);
alter table public.ai_notes enable row level security;
create policy "ai notes read" on public.ai_notes for select using (public.is_admin());
revoke insert, update, delete on public.ai_notes from anon, authenticated;

create table public.calendar_feed (
  id int primary key default 1 check (id = 1),
  token text not null check (length(token) >= 32),
  made_at timestamptz not null default now(),
  made_by uuid default auth.uid()
);
alter table public.calendar_feed enable row level security;
revoke all on public.calendar_feed from anon, authenticated;

-- The address's secret: the one there is, or a new one (p_new: renew, the old address stops working)
create or replace function public.calendar_feed_token(p_new boolean default false) returns text
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  select token into v from public.calendar_feed where id = 1;
  if v is null or p_new then
    v := encode(gen_random_bytes(24), 'hex');
    insert into public.calendar_feed (id, token, made_at, made_by) values (1, v, now(), auth.uid())
    on conflict (id) do update set token = excluded.token, made_at = now(), made_by = auth.uid();
  end if;
  return v;
end $$;
revoke all on function public.calendar_feed_token(boolean) from public, anon;
grant execute on function public.calendar_feed_token(boolean) to authenticated;
