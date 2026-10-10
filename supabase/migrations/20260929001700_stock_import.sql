-- Sawadee STOCK: items as the shops buy and count them (owner's choice 2026-10-10, from the Truffle Donut monthly stock
-- sheet): purchase units (bag, pack, box, gallon …), a category (food / packaging / non-food), what one unit holds
-- (1 bag = 22,500 g, for recipes later) and whether the price has VAT. Owners import a whole item list at once.

alter table public.stock_items drop constraint stock_items_unit_check;
alter table public.stock_items add constraint stock_items_unit_check check (unit in
  ('kg', 'g', 'l', 'ml', 'pcs', 'btl', 'can', 'bag', 'pack', 'box', 'case', 'gallon', 'bucket', 'roll', 'tray', 'sheet'));
alter table public.stock_items
  add column category  text not null default 'food' check (category in ('food', 'packaging', 'non_food')),
  add column pack_size numeric(14, 3) check (pack_size > 0),          -- what one unit holds, e.g. 22500
  add column pack_unit text check (pack_unit in ('g', 'ml', 'pcs')),  -- … in this unit (g)
  add column vat       boolean not null default true,                 -- unit_cost is before VAT; true = VAT is added on top
  add constraint stock_items_pack_check check ((pack_size is null) = (pack_unit is null));

-- Sheet prices are often the VAT-inclusive price ÷ 1.07 (130.8411215 ฿): keep 4 decimals so stock values match the sheet
alter table public.stock_items alter column unit_cost type numeric(14, 4);
alter table public.stock_take_lines alter column unit_cost type numeric(14, 4);

-- Products are what the shop makes and sells (food)
update public.stock_items set category = 'food' where kind = 'product';

grant insert (category, pack_size, pack_unit, vat) on public.stock_items to authenticated;
grant update (category, pack_size, pack_unit, vat) on public.stock_items to authenticated;

-- Owners import an item list into one branch: new skus are added, existing ones updated (names are merged, so a
-- Japanese name typed later is kept). Suppliers are created by name. p_deactivate_others hides this branch's items
-- that are not in the list. Stock itself is not set here: the screen sends the counted stock to stock_take() next.
-- p_rows: [{sku, name: {en, th, …}, unit, category, supplier, unit_cost, vat, pack_size, pack_unit}, …]
-- Returns {added, updated, deactivated}. Errors: admin_only, no_rows, bad_row (DETAIL = the sku).
create or replace function public.stock_import_items(p_branch uuid, p_rows jsonb, p_deactivate_others boolean default false)
  returns jsonb
  language plpgsql security definer set search_path = public as $$
declare
  v_added int := 0;
  v_updated int := 0;
  v_off int := 0;
  r jsonb;
  v_sup uuid;
  v_new boolean;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'no_branch';
  end if;
  if jsonb_typeof(p_rows) <> 'array' or jsonb_array_length(p_rows) = 0 then
    raise exception 'no_rows';
  end if;

  for r in select * from jsonb_array_elements(p_rows) loop
    if coalesce(r ->> 'sku', '') !~ '^[A-Za-z0-9._-]{1,40}$'
       or coalesce(r ->> 'unit', '') not in ('kg', 'g', 'l', 'ml', 'pcs', 'btl', 'can', 'bag', 'pack', 'box', 'case', 'gallon', 'bucket', 'roll', 'tray', 'sheet')
       or coalesce(r ->> 'category', 'food') not in ('food', 'packaging', 'non_food') then
      raise exception 'bad_row' using detail = coalesce(r ->> 'sku', '');
    end if;

    v_sup := null;
    if coalesce(btrim(r ->> 'supplier'), '') <> '' then
      insert into public.stock_suppliers (name) values (btrim(r ->> 'supplier')) on conflict (name) do nothing;
      select id into v_sup from public.stock_suppliers where name = btrim(r ->> 'supplier');
    end if;

    insert into public.stock_items as i (branch_id, sku, kind, unit, category, name_i18n, unit_cost, vat, supplier_id, pack_size, pack_unit)
    values (p_branch, r ->> 'sku', 'raw', r ->> 'unit', coalesce(r ->> 'category', 'food'), coalesce(r -> 'name', '{}'),
            greatest(coalesce((r ->> 'unit_cost')::numeric, 0), 0), coalesce((r ->> 'vat')::boolean, true), v_sup,
            nullif((r ->> 'pack_size')::numeric, 0), case when nullif((r ->> 'pack_size')::numeric, 0) is null then null else r ->> 'pack_unit' end)
    on conflict (branch_id, sku) do update set
      unit = excluded.unit, category = excluded.category, name_i18n = i.name_i18n || excluded.name_i18n,
      unit_cost = excluded.unit_cost, vat = excluded.vat, supplier_id = coalesce(excluded.supplier_id, i.supplier_id),
      pack_size = coalesce(excluded.pack_size, i.pack_size), pack_unit = coalesce(excluded.pack_unit, i.pack_unit),
      active = true, updated_at = now()
    returning (xmax = 0) into v_new;
    if v_new then v_added := v_added + 1; else v_updated := v_updated + 1; end if;
  end loop;

  if p_deactivate_others then
    update public.stock_items set active = false, updated_at = now()
    where branch_id = p_branch and active and sku not in (select x ->> 'sku' from jsonb_array_elements(p_rows) x);
    get diagnostics v_off = row_count;
  end if;

  return jsonb_build_object('added', v_added, 'updated', v_updated, 'deactivated', v_off);
end $$;

revoke execute on function public.stock_import_items(uuid, jsonb, boolean) from public, anon;
grant execute on function public.stock_import_items(uuid, jsonb, boolean) to authenticated;

comment on column public.stock_items.category is 'food / packaging / non_food (as on the monthly stock sheet)';
comment on column public.stock_items.pack_size is 'What one unit holds (with pack_unit), e.g. 1 bag = 22500 g; recipes may use it';

-- stock_record(): same as before, but a transfer that creates the item in the receiving branch copies the new columns too
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
    insert into public.stock_items (branch_id, sku, kind, unit, name_i18n, min_qty, unit_cost, supplier_id, deduct_on_sale,
                                    category, pack_size, pack_unit, vat)
    values (p_to_branch, v_item.sku, v_item.kind, v_item.unit, v_item.name_i18n, v_item.min_qty, v_item.unit_cost,
            v_item.supplier_id, v_item.deduct_on_sale, v_item.category, v_item.pack_size, v_item.pack_unit, v_item.vat)
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

