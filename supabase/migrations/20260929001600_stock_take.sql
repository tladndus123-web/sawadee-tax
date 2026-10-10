-- Sawadee STOCK: stocktaking (owner's decision 2026-10-10). Staff and owners count what is on the shelves; the
-- differences from the book stock become adjustment movements in one go. Optionally the branch's whole stock value
-- (on hand × unit cost, after the count) goes into TAX's month-end stock (stock_counts), so TAX needs no typing;
-- a closed month is left as it is.

create table public.stock_takes (
  id          uuid primary key default gen_random_uuid(),  -- also the batch_id of its adjustment movements
  branch_id   uuid not null references public.branches (id) on delete restrict,
  user_id     uuid references auth.users (id) on delete set null,
  taken_at    timestamptz not null default now(),
  items       int not null,                -- items counted
  diff_value  numeric(14, 2) not null,     -- value of the differences (baht, minus = missing)
  stock_value numeric(14, 2) not null,     -- the branch's whole stock value after the count (baht)
  tax_month   text check (tax_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),  -- sent to TAX month-end stock for this month
  note        text not null default '' check (length(note) <= 200)
);
create index stock_takes_branch_time on public.stock_takes (branch_id, taken_at desc);

create table public.stock_take_lines (
  take_id   uuid not null references public.stock_takes (id) on delete restrict,
  item_id   uuid not null references public.stock_items (id) on delete restrict,
  book_qty  numeric(14, 3) not null,
  counted   numeric(14, 3) not null check (counted >= 0),
  unit_cost numeric(14, 2) not null,
  primary key (take_id, item_id)
);

alter table public.stock_takes enable row level security;
alter table public.stock_take_lines enable row level security;
create policy "takes read" on public.stock_takes for select using (public.is_member() and public.can_see_branch(branch_id));
create policy "take lines read" on public.stock_take_lines for select using (
  exists (select 1 from public.stock_takes t where t.id = take_id and public.is_member() and public.can_see_branch(t.branch_id)));
revoke insert, update, delete, truncate on public.stock_takes, public.stock_take_lines from anon, authenticated;

-- Record a count. p_counts: [{"item_id": "...", "counted": 12.5}, …] (only the items counted; others stay as they are).
-- p_tax_month 'YYYY-MM': also put the whole stock value into TAX's month-end stock for that month (skipped when the
-- month is closed). Returns {take_id, changed, diff_value, stock_value, tax: 'saved' | 'locked' | 'none'}.
-- Errors: no_access, no_counts, no_item, bad_qty.
create or replace function public.stock_take(p_branch uuid, p_counts jsonb, p_tax_month text default null, p_note text default '')
  returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_take uuid := gen_random_uuid();
  v_uid uuid := auth.uid();
  v_changed int := 0;
  v_diff numeric := 0;
  v_value numeric;
  v_tax text := 'none';
  r record;
begin
  if not public.is_member() or not public.can_see_branch(p_branch) then
    raise exception 'no_access';
  end if;
  if jsonb_typeof(p_counts) <> 'array' or jsonb_array_length(p_counts) = 0 then
    raise exception 'no_counts';
  end if;
  if p_tax_month is not null and p_tax_month !~ '^\d{4}-(0[1-9]|1[0-2])$' then
    raise exception 'bad_month';
  end if;

  -- Lock the counted items (id order), then check every line before writing anything
  perform 1 from public.stock_items
  where id in (select (c ->> 'item_id')::uuid from jsonb_array_elements(p_counts) c)
  order by id for update;

  for r in
    select (c ->> 'item_id')::uuid as item_id, round((c ->> 'counted')::numeric, 3) as counted, i.id, i.on_hand, i.unit_cost
    from jsonb_array_elements(p_counts) c
    left join public.stock_items i on i.id = (c ->> 'item_id')::uuid and i.branch_id = p_branch and i.active
  loop
    if r.id is null then
      raise exception 'no_item';
    end if;
    if r.counted is null or r.counted < 0 then
      raise exception 'bad_qty';
    end if;
  end loop;

  insert into public.stock_takes (id, branch_id, user_id, items, diff_value, stock_value, tax_month, note)
  values (v_take, p_branch, v_uid, jsonb_array_length(p_counts), 0, 0, null, coalesce(p_note, ''));

  for r in
    select i.id, i.on_hand, i.unit_cost, round((c ->> 'counted')::numeric, 3) as counted
    from jsonb_array_elements(p_counts) c
    join public.stock_items i on i.id = (c ->> 'item_id')::uuid
  loop
    insert into public.stock_take_lines (take_id, item_id, book_qty, counted, unit_cost)
    values (v_take, r.id, r.on_hand, r.counted, r.unit_cost);
    if r.counted <> r.on_hand then
      v_changed := v_changed + 1;
      v_diff := v_diff + (r.counted - r.on_hand) * r.unit_cost;
      insert into public.stock_movements (batch_id, branch_id, item_id, type, qty, note, user_id)
      values (v_take, p_branch, r.id, case when r.counted > r.on_hand then 'adjust_in' else 'adjust_out' end,
              abs(r.counted - r.on_hand), coalesce(p_note, ''), v_uid);
    end if;
  end loop;

  -- The branch's whole stock value after the count (every active item, counted or not)
  select coalesce(round(sum(on_hand * unit_cost), 2), 0) into v_value from public.stock_items where branch_id = p_branch and active;

  if p_tax_month is not null then
    if public.month_locked(p_tax_month) then
      v_tax := 'locked';
    else
      insert into public.stock_counts (branch_id, month, amount, note)
      values (p_branch, p_tax_month, v_value, 'Sawadee STOCK')
      on conflict (branch_id, month) do update set amount = excluded.amount, note = excluded.note;
      v_tax := 'saved';
    end if;
  end if;

  update public.stock_takes
  set diff_value = round(v_diff, 2), stock_value = v_value, tax_month = case when v_tax = 'saved' then p_tax_month end
  where id = v_take;

  return jsonb_build_object('take_id', v_take, 'changed', v_changed, 'diff_value', round(v_diff, 2),
                            'stock_value', v_value, 'tax', v_tax);
end $$;

revoke execute on function public.stock_take(uuid, jsonb, text, text) from public, anon;
grant execute on function public.stock_take(uuid, jsonb, text, text) to authenticated;

comment on table public.stock_takes is 'Sawadee STOCK: stocktakes (counts); their differences are adjustment movements with batch_id = id';
comment on table public.stock_take_lines is 'Sawadee STOCK: each counted item of a stocktake (book and counted quantity)';
