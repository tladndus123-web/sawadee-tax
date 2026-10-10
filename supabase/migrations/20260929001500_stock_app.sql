-- Sawadee STOCK (separate app, same database; owner's decision 2026-10-09). Item-level stock per branch:
-- ingredients and products, recipes, and every change as a movement. TAX tables are only read (branches, members,
-- the branch PINs through can_see_branch()); nothing of the books changes. Owners = TAX admins.
--
-- Rules:
-- 1. Stock changes only through movements (append-only). stock_items.on_hand is kept by a trigger and can never
--    go below zero (check constraint), so no sale, use, waste or transfer can take more than there is.
-- 2. stock_record() is the one way in: making deducts the recipe's ingredients and a transfer moves stock between
--    two branches, each in one transaction; a shortage cancels everything and lists what is missing.

-- Suppliers (one list for every branch)
create table public.stock_suppliers (
  id         uuid primary key default gen_random_uuid(),
  name       text not null unique check (length(btrim(name)) > 0),
  created_at timestamptz not null default now()
);

-- Items: one row per branch and sku. The sku is the code shared by branches (transfers, recipes) and POS imports.
create table public.stock_items (
  id             uuid primary key default gen_random_uuid(),
  branch_id      uuid not null references public.branches (id) on delete restrict,
  sku            text not null check (sku ~ '^[A-Za-z0-9._-]{1,40}$'),
  kind           text not null check (kind in ('raw', 'product')),
  unit           text not null check (unit in ('kg', 'pcs', 'btl', 'can')),
  name_i18n      jsonb not null default '{}' check (jsonb_typeof(name_i18n) = 'object'),
  min_qty        numeric(14, 3) not null default 0 check (min_qty >= 0),
  unit_cost      numeric(14, 2) not null default 0 check (unit_cost >= 0),
  supplier_id    uuid references public.stock_suppliers (id) on delete set null,
  -- Made while selling (e.g. khao man gai): a sale deducts the recipe's ingredients (used by the POS import)
  deduct_on_sale boolean not null default false,
  active         boolean not null default true,
  on_hand        numeric(14, 3) not null default 0 check (on_hand >= 0),  -- kept by stock_movements_apply()
  created_at     timestamptz not null default now(),
  updated_at     timestamptz not null default now(),
  unique (branch_id, sku),
  unique (id, branch_id)  -- lets movements check that the item belongs to their branch
);

-- Recipes by sku (the same for every branch): ingredients used for one product
create table public.stock_recipes (
  product_sku    text not null,
  ingredient_sku text not null,
  qty_per_unit   numeric(14, 4) not null check (qty_per_unit > 0),
  primary key (product_sku, ingredient_sku),
  check (product_sku <> ingredient_sku)
);

-- Every change. qty is always positive; delta carries the sign.
create table public.stock_movements (
  id             bigint generated always as identity primary key,
  batch_id       uuid not null,  -- rows written together (making: product + ingredients; transfer: out + in)
  branch_id      uuid not null,
  item_id        uuid not null,
  type           text not null check (type in
                   ('in', 'use', 'make', 'sell', 'loss', 'transfer_out', 'transfer_in', 'adjust_in', 'adjust_out')),
  qty            numeric(14, 3) not null check (qty > 0),
  delta          numeric(14, 3) generated always as
                   (case when type in ('in', 'make', 'transfer_in', 'adjust_in') then qty else -qty end) stored,
  reason         text check (reason in ('unsold', 'broken', 'expired')),
  peer_branch_id uuid references public.branches (id) on delete restrict,  -- the other branch of a transfer
  note           text not null default '' check (length(note) <= 200),
  user_id        uuid references auth.users (id) on delete set null,
  source         text not null default 'manual' check (source in ('manual', 'pos_import', 'sawadee_tax')),
  external_ref   text,  -- the POS sale this came from (shown in history; stock_external_refs keeps it unique)
  created_at     timestamptz not null default now(),
  foreign key (item_id, branch_id) references public.stock_items (id, branch_id) on delete restrict,
  check ((type = 'loss') = (reason is not null)),
  check ((type in ('transfer_out', 'transfer_in')) = (peer_branch_id is not null))
);
create index stock_movements_branch_time on public.stock_movements (branch_id, created_at desc);
create index stock_movements_item_time on public.stock_movements (item_id, created_at desc);
create index stock_movements_batch on public.stock_movements (batch_id);

-- External sales already counted: the same POS sale sent twice is applied once
create table public.stock_external_refs (
  source       text not null,
  external_ref text not null,
  batch_id     uuid not null,
  created_at   timestamptz not null default now(),
  primary key (source, external_ref)
);

-- on_hand follows the movements; movements are never changed or removed (correct with an adjustment)
create or replace function public.stock_movements_apply() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op <> 'INSERT' then
    raise exception 'stock movements cannot be changed or removed';
  end if;
  update public.stock_items set on_hand = on_hand + new.delta, updated_at = now() where id = new.item_id;
  return new;
end $$;
create trigger stock_movements_apply after insert or update or delete on public.stock_movements
  for each row execute function public.stock_movements_apply();

-- RLS: members read the branches they may see (TAX PIN rules); admins (owners) manage items, recipes, suppliers.
-- Nobody writes movements directly: only stock_record().
alter table public.stock_suppliers enable row level security;
alter table public.stock_items enable row level security;
alter table public.stock_recipes enable row level security;
alter table public.stock_movements enable row level security;
alter table public.stock_external_refs enable row level security;

create policy "suppliers read"  on public.stock_suppliers for select using (public.is_member());
create policy "suppliers admin" on public.stock_suppliers for all using (public.is_admin()) with check (public.is_admin());
create policy "items read"   on public.stock_items for select using (public.is_member() and public.can_see_branch(branch_id));
create policy "items add"    on public.stock_items for insert with check (public.is_admin());
create policy "items change" on public.stock_items for update using (public.is_admin()) with check (public.is_admin());
create policy "recipes read"  on public.stock_recipes for select using (public.is_member());
create policy "recipes admin" on public.stock_recipes for all using (public.is_admin()) with check (public.is_admin());
create policy "movements read" on public.stock_movements for select
  using (public.is_member() and public.can_see_branch(branch_id));

-- Column rights: on_hand only through movements; an item keeps its branch and sku (recipes and history use them)
revoke insert, update, delete on public.stock_items from anon, authenticated;
grant insert (id, branch_id, sku, kind, unit, name_i18n, min_qty, unit_cost, supplier_id, deduct_on_sale, active)
  on public.stock_items to authenticated;
grant update (kind, unit, name_i18n, min_qty, unit_cost, supplier_id, deduct_on_sale, active, updated_at)
  on public.stock_items to authenticated;
revoke insert, update, delete on public.stock_movements, public.stock_external_refs from anon, authenticated;
-- Emptying a whole table skips RLS and the history trigger: nobody but the database owner may
revoke truncate on public.stock_suppliers, public.stock_items, public.stock_recipes, public.stock_movements,
  public.stock_external_refs from anon, authenticated;

-- Record one thing that happened. p_type: in, use, make, sell, loss, transfer, adjust_in, adjust_out.
-- Returns the batch id. Errors: no_access, no_item, bad_qty, bad_type, bad_reason, bad_target,
-- not_enough (DETAIL = JSON list of {sku, need, have}; nothing is written).
create or replace function public.stock_record(
  p_branch uuid, p_item uuid, p_type text, p_qty numeric,
  p_reason text default null, p_to_branch uuid default null, p_note text default '',
  p_source text default 'manual', p_external_ref text default null
) returns uuid
  language plpgsql security definer set search_path = public as $$
declare
  v_batch uuid := gen_random_uuid();
  v_item public.stock_items;
  v_to public.stock_items;
  v_qty numeric := round(p_qty, 3);
  v_short jsonb := '[]';
  v_uid uuid := auth.uid();
  r record;
begin
  if not public.is_member() or not public.can_see_branch(p_branch) then
    raise exception 'no_access';
  end if;
  if p_type not in ('in', 'use', 'make', 'sell', 'loss', 'transfer', 'adjust_in', 'adjust_out') then
    raise exception 'bad_type';
  end if;
  if v_qty is null or v_qty <= 0 then
    raise exception 'bad_qty';
  end if;
  if (p_type = 'loss') <> (p_reason is not null) or coalesce(p_reason, 'unsold') not in ('unsold', 'broken', 'expired') then
    raise exception 'bad_reason';
  end if;

  -- The same external sale twice: already counted, return the first batch
  if p_external_ref is not null then
    select batch_id into v_batch from public.stock_external_refs where source = p_source and external_ref = p_external_ref;
    if found then
      return v_batch;
    end if;
    v_batch := gen_random_uuid();
    insert into public.stock_external_refs (source, external_ref, batch_id) values (p_source, p_external_ref, v_batch);
  end if;

  select * into v_item from public.stock_items where id = p_item and branch_id = p_branch and active for update;
  if not found then
    raise exception 'no_item';
  end if;
  if p_type in ('make', 'sell') and v_item.kind <> 'product' then
    raise exception 'bad_type';
  end if;

  if p_type = 'make' then
    -- Lock every ingredient (in id order, so two makes never wait on each other), then check all of them first
    perform 1 from public.stock_items
    where branch_id = p_branch and sku in (select ingredient_sku from public.stock_recipes where product_sku = v_item.sku)
    order by id
    for update;
    for r in
      select rc.ingredient_sku as sku, round(rc.qty_per_unit * v_qty, 3) as need, i.id, coalesce(i.on_hand, 0) as have
      from public.stock_recipes rc
      left join public.stock_items i on i.branch_id = p_branch and i.sku = rc.ingredient_sku
      where rc.product_sku = v_item.sku
      order by rc.ingredient_sku
    loop
      if r.id is null or r.have < r.need then
        v_short := v_short || jsonb_build_object('sku', r.sku, 'need', r.need, 'have', r.have);
      end if;
    end loop;
    if jsonb_array_length(v_short) > 0 then
      raise exception 'not_enough' using detail = v_short::text;
    end if;
    insert into public.stock_movements (batch_id, branch_id, item_id, type, qty, note, user_id, source, external_ref)
    select v_batch, p_branch, i.id, 'use', round(rc.qty_per_unit * v_qty, 3), p_note, v_uid, p_source, p_external_ref
    from public.stock_recipes rc
    join public.stock_items i on i.branch_id = p_branch and i.sku = rc.ingredient_sku
    where rc.product_sku = v_item.sku and round(rc.qty_per_unit * v_qty, 3) > 0;
  elsif p_type in ('use', 'sell', 'loss', 'transfer', 'adjust_out') and v_item.on_hand < v_qty then
    raise exception 'not_enough' using
      detail = jsonb_build_array(jsonb_build_object('sku', v_item.sku, 'need', v_qty, 'have', v_item.on_hand))::text;
  end if;

  if p_type = 'transfer' then
    if p_to_branch is null or p_to_branch = p_branch or not exists (select 1 from public.branches where id = p_to_branch) then
      raise exception 'bad_target';
    end if;
    -- The receiving branch gets the same item (same sku) if it does not have it yet
    insert into public.stock_items (branch_id, sku, kind, unit, name_i18n, min_qty, unit_cost, supplier_id, deduct_on_sale)
    values (p_to_branch, v_item.sku, v_item.kind, v_item.unit, v_item.name_i18n, v_item.min_qty, v_item.unit_cost,
            v_item.supplier_id, v_item.deduct_on_sale)
    on conflict (branch_id, sku) do update set active = true;
    select * into v_to from public.stock_items where branch_id = p_to_branch and sku = v_item.sku;
    insert into public.stock_movements (batch_id, branch_id, item_id, type, qty, peer_branch_id, note, user_id, source)
    values (v_batch, p_branch, v_item.id, 'transfer_out', v_qty, p_to_branch, p_note, v_uid, p_source),
           (v_batch, p_to_branch, v_to.id, 'transfer_in', v_qty, p_branch, p_note, v_uid, p_source);
  else
    insert into public.stock_movements (batch_id, branch_id, item_id, type, qty, reason, note, user_id, source, external_ref)
    values (v_batch, p_branch, v_item.id, p_type, v_qty, p_reason, p_note, v_uid, p_source, p_external_ref);
  end if;
  return v_batch;
end $$;

revoke execute on function public.stock_record(uuid, uuid, text, numeric, text, uuid, text, text, text) from public, anon;
grant execute on function public.stock_record(uuid, uuid, text, numeric, text, uuid, text, text, text) to authenticated;
revoke execute on function public.stock_movements_apply() from public, anon, authenticated;

comment on table public.stock_suppliers is 'Sawadee STOCK: suppliers of ingredients';
comment on table public.stock_items is 'Sawadee STOCK: ingredients and products per branch; on_hand follows stock_movements';
comment on table public.stock_recipes is 'Sawadee STOCK: ingredients for one product, by sku';
comment on table public.stock_movements is 'Sawadee STOCK: every stock change (append-only), written by stock_record()';
comment on table public.stock_external_refs is 'Sawadee STOCK: POS sales already applied (each once)';
