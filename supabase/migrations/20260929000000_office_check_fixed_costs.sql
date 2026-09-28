-- Office review and fixed costs (owner's decisions 2026-09-29, after the accountant's feedback):
-- 1. A document saved by staff or by the LINE bot goes straight into the books, but stays "unchecked" until an admin
--    (the office) looks at it. A document an admin saves or edits is checked by that. A staff edit afterwards makes
--    it unchecked again. Checking is allowed on closed months (it changes nothing in the books).
-- 2. Fixed costs (rent, internet, insurance …) that have no invoice: entered once with a category and the months they
--    apply to, counted every month like a purchase of that category. Amounts are history: a closed month's fixed
--    cost cannot change, so a new amount starts a new line.
-- 3. company_settings.pos_columns: which Excel columns the POS export uses, learnt from an import in the app, so a file
--    sent to the LINE bot can be read without anyone matching columns again.

-- 1. Office check ---------------------------------------------------------------------------------------------------
alter table public.documents
  add column checked_at timestamptz,
  add column checked_by uuid references auth.users (id) on delete set null;

-- Everything saved before today counts as looked at: the office starts with an empty list
update public.documents set checked_at = now() where status = 'reviewed' and deleted_at is null;

create or replace function public.documents_check_stamp() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  -- Changes that are not "content": marking paid, stickers, accepted warnings, the check itself, housekeeping
  ignore constant text[] := array['updated_at', 'updated_by', 'checked_at', 'checked_by', 'paid', 'paid_date', 'stickers',
                                  'ack_flags', 'ack_by', 'ack_at', 'photo_hash', 'deleted_at', 'deleted_by', 'delete_reason'];
  admin boolean := auth.uid() is not null and public.is_admin();
  changed boolean;
begin
  if tg_op = 'INSERT' then
    if admin and new.status = 'reviewed' then
      new.checked_at := now();
      new.checked_by := auth.uid();
    else
      new.checked_at := null;
      new.checked_by := null;
    end if;
    return new;
  end if;

  changed := (to_jsonb(new) - ignore) is distinct from (to_jsonb(old) - ignore);
  if admin then
    if new.checked_at is distinct from old.checked_at then
      -- The office checks (or unchecks) on purpose
      if new.checked_at is null then
        new.checked_by := null;
      else
        new.checked_at := now();
        new.checked_by := auth.uid();
      end if;
    elsif new.status <> 'reviewed' then
      new.checked_at := null;
      new.checked_by := null;
    elsif old.checked_at is null and changed then
      -- An admin who edits a document has looked at it
      new.checked_at := now();
      new.checked_by := auth.uid();
    end if;
  else
    -- Staff, or the service role (LINE bot, scripts): cannot check, and a content change needs a new look
    if new.checked_at is distinct from old.checked_at or new.checked_by is distinct from old.checked_by then
      raise exception 'only admins can check documents';
    end if;
    if changed or new.status <> 'reviewed' then
      new.checked_at := null;
      new.checked_by := null;
    end if;
  end if;
  return new;
end $$;
-- Name order: runs after documents_ack_stamp and before documents_month_lock
create trigger documents_check_stamp before insert or update on public.documents
  for each row execute function public.documents_check_stamp();

-- The check may still change on a closed month's document (otherwise as in 20260928000600_memo)
create or replace function public.documents_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  free constant text[] := array['paid', 'paid_date', 'stickers', 'vendor_id', 'ack_flags', 'ack_by', 'ack_at', 'updated_at', 'updated_by', 'disposed_on', 'photo_hash', 'memo', 'checked_at', 'checked_by'];
  was_locked boolean := false;
  now_locked boolean := new.status = 'reviewed' and public.month_locked(public.claim_month(new.tax_month, new.doc_date));
begin
  if tg_op = 'UPDATE' then
    was_locked := old.status = 'reviewed' and public.month_locked(public.claim_month(old.tax_month, old.doc_date));
  end if;
  if tg_op = 'INSERT' and now_locked then
    raise exception 'month_locked: % is closed', public.claim_month(new.tax_month, new.doc_date);
  end if;
  if tg_op = 'UPDATE' and (was_locked or now_locked) and (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'month_locked: % is closed',
      case when was_locked then public.claim_month(old.tax_month, old.doc_date) else public.claim_month(new.tax_month, new.doc_date) end;
  end if;
  -- The disposal date moves costs into its month: both the old and the new disposal month must be open
  if tg_op = 'UPDATE' and new.disposed_on is distinct from old.disposed_on then
    if old.disposed_on is not null and public.month_locked(to_char(old.disposed_on, 'YYYY-MM')) then
      raise exception 'month_locked: % is closed', to_char(old.disposed_on, 'YYYY-MM');
    end if;
    if new.disposed_on is not null and public.month_locked(to_char(new.disposed_on, 'YYYY-MM')) then
      raise exception 'month_locked: % is closed', to_char(new.disposed_on, 'YYYY-MM');
    end if;
  end if;
  return new;
end $$;

-- 2. Fixed costs ----------------------------------------------------------------------------------------------------
create table public.fixed_costs (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null default public.head_branch() references public.branches (id) on delete restrict,
  category    text not null references public.categories (key) on delete restrict,
  name        text not null check (length(trim(name)) between 1 and 60),
  amount      numeric(12, 2) not null check (amount >= 0),
  from_month  text not null check (from_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  to_month    text check (to_month is null or (to_month ~ '^\d{4}-(0[1-9]|1[0-2])$' and to_month >= from_month)),
  note        text not null default '' check (length(note) <= 200),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
alter table public.fixed_costs enable row level security;
create policy "fixed read"  on public.fixed_costs for select using (public.is_member());
create policy "fixed admin" on public.fixed_costs for all using (public.is_admin()) with check (public.is_admin());

-- A closed month keeps its fixed costs: a line that covers a closed month cannot be added, changed or removed, except
-- that it may be ended (to_month) after the last closed month it covers.
create or replace function public.fixed_costs_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  covered_lock text;
begin
  if tg_op = 'INSERT' then
    if exists (select 1 from public.month_locks where month >= new.from_month and (new.to_month is null or month <= new.to_month)) then
      raise exception 'month_locked: a closed month is in the range';
    end if;
    return new;
  end if;
  select max(month) into covered_lock from public.month_locks
   where month >= old.from_month and (old.to_month is null or month <= old.to_month);
  if tg_op = 'DELETE' then
    if covered_lock is not null then
      raise exception 'month_locked: % is closed', covered_lock;
    end if;
    return old;
  end if;
  if covered_lock is not null then
    if new.amount is distinct from old.amount or new.category is distinct from old.category
       or new.branch_id is distinct from old.branch_id or new.from_month is distinct from old.from_month then
      raise exception 'month_locked: % is closed', covered_lock;
    end if;
    if new.to_month is distinct from old.to_month and (new.to_month is null or new.to_month < covered_lock) then
      raise exception 'month_locked: % is closed', covered_lock;
    end if;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger fixed_costs_guard before insert or update or delete on public.fixed_costs
  for each row execute function public.fixed_costs_guard();

-- 3. POS column memory ----------------------------------------------------------------------------------------------
alter table public.company_settings
  add column pos_columns jsonb not null default '{}' check (jsonb_typeof(pos_columns) = 'object');

-- A category with fixed costs is in use too
create or replace function public.categories_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.builtin then
      raise exception 'category_builtin: % cannot be deleted', old.key;
    end if;
    if exists (select 1 from public.documents where category = old.key)
       or exists (select 1 from public.document_items where category = old.key)
       or exists (select 1 from public.vendors where rule_category = old.key)
       or exists (select 1 from public.fixed_costs where category = old.key) then
      raise exception 'category_in_use: % is used', old.key;
    end if;
    return old;
  end if;
  -- a built-in category stays built-in, and "other" (the fallback) stays visible
  new.builtin := old.builtin;
  if new.key = 'other' then new.hidden := false; end if;
  new.updated_at := now();
  return new;
end $$;
