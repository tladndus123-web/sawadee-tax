-- Several closing reports for one day (customer feedback 2026-11-05, YUNA: breakfast · lunch · dinner — three slips a
-- day). A day and channel of a branch may now hold several slips: `part` 1, 2, 3 … each its own line with its own
-- photo, and every total adds them up (the totals already sum lines). A new line without a part gets the next one.
-- A POS file import still gives one line per day: it replaces the day, extra slips included
-- (sales_clear_extra_slips). Existing lines become part 1; nothing else changes.

alter table public.sales add column part smallint not null default 0 check (part between 0 and 50);
update public.sales set part = 1;
alter table public.sales drop constraint sales_branch_date_channel_key;
alter table public.sales add constraint sales_branch_date_channel_part_key unique (branch_id, sale_date, channel, part);

-- part 0 = "the next slip of that day" (1 for the first)
create or replace function public.sales_part() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.part = 0 then
    perform pg_advisory_xact_lock(hashtext(new.branch_id::text || new.sale_date::text || new.channel));
    select coalesce(max(part), 0) + 1 into new.part
    from public.sales where branch_id = new.branch_id and sale_date = new.sale_date and channel = new.channel;
  end if;
  return new;
end $$;
create trigger sales_part before insert on public.sales for each row execute function public.sales_part();

-- A POS file import sets whole days: the slips after the first of those days go (the first is overwritten by the
-- import). Members of that branch only; closed months stay closed (sales_guard).
create or replace function public.sales_clear_extra_slips(p_branch uuid, p_dates date[], p_channels text[]) returns integer
  language plpgsql security definer set search_path = public as $$
declare
  v_branch uuid := coalesce(p_branch, public.head_branch());
  n integer;
begin
  if auth.uid() is not null and not (public.is_member() and public.can_see_branch(v_branch)) then
    raise exception 'not allowed';
  end if;
  delete from public.sales s
  using unnest(p_dates, p_channels) as d(sale_date, channel)
  where s.branch_id = v_branch and s.sale_date = d.sale_date and s.channel = d.channel and s.part > 1;
  get diagnostics n = row_count;
  return n;
end $$;
revoke all on function public.sales_clear_extra_slips(uuid, date[], text[]) from public, anon;
grant execute on function public.sales_clear_extra_slips(uuid, date[], text[]) to authenticated;
