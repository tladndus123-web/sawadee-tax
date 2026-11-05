-- (owner, 2026-11-06) The company's own name and address typed in the settings (until now taken from the invoices it
-- received), and a second calendar subscription: the staff work schedule (attendance), easy to share with the staff.
-- company_settings.address {th, en}; calendar_feed holds two secrets (1 = company dates, 2 = staff schedule).
-- Adds a column, widens a check and a function; no data changes.

alter table public.company_settings add column address jsonb not null default '{}'::jsonb;

alter table public.calendar_feed drop constraint calendar_feed_id_check;
alter table public.calendar_feed add constraint calendar_feed_id_check check (id in (1, 2));

drop function public.calendar_feed_token(boolean);
-- The address's secret for feed p_which (1 = company dates, 2 = staff schedule): the one there is, or a new one
create or replace function public.calendar_feed_token(p_new boolean default false, p_which int default 1) returns text
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  if p_which not in (1, 2) then
    raise exception 'bad_feed';
  end if;
  select token into v from public.calendar_feed where id = p_which;
  if v is null or p_new then
    v := encode(gen_random_bytes(24), 'hex');
    insert into public.calendar_feed (id, token, made_at, made_by) values (p_which, v, now(), auth.uid())
    on conflict (id) do update set token = excluded.token, made_at = now(), made_by = auth.uid();
  end if;
  return v;
end $$;
revoke all on function public.calendar_feed_token(boolean, int) from public, anon;
grant execute on function public.calendar_feed_token(boolean, int) to authenticated;
