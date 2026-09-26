-- Month close: once a tax month has been filed, an admin closes it. From then on its saved documents
-- (status 'reviewed', dated in that month) can't be added, changed, moved out, deleted or restored until an
-- admin reopens the month. Drafts stay free (they are not in the report). Paying an invoice and colour
-- stickers stay possible: they don't change the purchase tax report.

create table public.month_locks (
  month     text primary key check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  locked_at timestamptz not null default now(),
  locked_by uuid references auth.users (id) default auth.uid()
);

alter table public.month_locks enable row level security;
create policy "month locks read" on public.month_locks for select using (public.is_member());
create policy "month locks close" on public.month_locks for insert with check (public.is_admin());
create policy "month locks reopen" on public.month_locks for delete using (public.is_admin());

create or replace function public.month_locked(d date) returns boolean
  language sql stable security definer set search_path = public as $$
  select d is not null and exists (select 1 from public.month_locks where month = to_char(d, 'YYYY-MM'))
$$;

create or replace function public.documents_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  -- Columns that may still change on a closed month's document
  free constant text[] := array['paid', 'paid_date', 'stickers', 'updated_at', 'updated_by'];
  was_locked boolean := false;
  now_locked boolean := new.status = 'reviewed' and public.month_locked(new.doc_date);
begin
  if tg_op = 'UPDATE' then
    was_locked := old.status = 'reviewed' and public.month_locked(old.doc_date);
  end if;
  if tg_op = 'INSERT' and now_locked then
    raise exception 'month_locked: % is closed', to_char(new.doc_date, 'YYYY-MM');
  end if;
  if tg_op = 'UPDATE' and (was_locked or now_locked) and (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'month_locked: % is closed', to_char(case when was_locked then old.doc_date else new.doc_date end, 'YYYY-MM');
  end if;
  return new;
end $$;
-- Runs before documents_stamp / documents_vendor (triggers fire in name order)
create trigger documents_month_lock before insert or update on public.documents
  for each row execute function public.documents_month_lock();

create or replace function public.document_items_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  d record;
begin
  select status, doc_date into d from public.documents where id = coalesce(new.document_id, old.document_id);
  if d.status = 'reviewed' and public.month_locked(d.doc_date) then
    raise exception 'month_locked: % is closed', to_char(d.doc_date, 'YYYY-MM');
  end if;
  return coalesce(new, old);
end $$;
create trigger document_items_month_lock before insert or update or delete on public.document_items
  for each row execute function public.document_items_month_lock();
