-- Sawadee STOCK rules (migration 20260929001500_stock_app.sql). Run: npm run db:test (everything rolls back)
begin;
create extension if not exists pgtap with schema extensions;
select plan(61);

-- Fixtures: one admin (owner), one staff, one signed-in stranger; branch A open, branch B with a PIN
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', 'Admin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@test.local', 'Staff', 'staff');
update public.members set role = 'staff' where user_id <> '00000000-0000-0000-0000-00000000000a';
insert into public.branches (id, no, name) values
  ('00000000-0000-0000-0000-0000000000a1', '90001', 'A'),
  ('00000000-0000-0000-0000-0000000000b1', '90002', 'B');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
-- on_hand of a sku in a branch (read as the database owner, so RLS does not hide it)
create function pg_temp.qty(b uuid, s text) returns numeric language sql security definer as $$
  select on_hand from public.stock_items where branch_id = b and sku = s
$$;
create function pg_temp.moves() returns bigint language sql security definer as $$
  select count(*) from public.stock_movements
$$;

set local role authenticated;

-- Owner sets up: B gets a PIN, items in A, a recipe
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select public.set_branch_pin('00000000-0000-0000-0000-0000000000b1', '4321');
select lives_ok($$
  insert into public.stock_items (id, branch_id, sku, kind, unit, min_qty, unit_cost) values
    ('00000000-0000-0000-0000-000000000f01', '00000000-0000-0000-0000-0000000000a1', 'FLOUR', 'raw', 'kg', 20, 48),
    ('00000000-0000-0000-0000-000000000f02', '00000000-0000-0000-0000-0000000000a1', 'EGG', 'raw', 'pcs', 100, 4.5),
    ('00000000-0000-0000-0000-000000000f03', '00000000-0000-0000-0000-0000000000a1', 'DONUT', 'product', 'pcs', 0, 38)
$$, 'the owner adds items');
select lives_ok($$
  insert into public.stock_recipes (product_sku, ingredient_sku, qty_per_unit) values ('DONUT', 'FLOUR', 0.06), ('DONUT', 'EGG', 0.5)
$$, 'the owner adds a recipe');
select throws_ok($$ insert into public.stock_items (branch_id, sku, kind, unit, on_hand) values
  ('00000000-0000-0000-0000-0000000000a1', 'X', 'raw', 'kg', 5) $$, '42501', NULL, 'nobody sets on_hand when adding an item');

-- Staff: reads only what they may see, cannot write items, movements or on_hand directly
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.stock_items where branch_id = '00000000-0000-0000-0000-0000000000a1'), 3, 'staff see an open branch');
select throws_ok($$ insert into public.stock_items (branch_id, sku, kind, unit) values ('00000000-0000-0000-0000-0000000000a1', 'Y', 'raw', 'kg') $$,
  '42501', NULL, 'staff cannot add items');
select throws_ok($$ update public.stock_items set on_hand = 999 where sku = 'FLOUR' $$, '42501', NULL, 'nobody edits on_hand by hand');
with u as (update public.stock_items set min_qty = 1 where sku = 'FLOUR' returning 1)
select is((select count(*)::int from u), 0, 'staff cannot change item settings');
select throws_ok($$ insert into public.stock_movements (batch_id, branch_id, item_id, type, qty)
  values (gen_random_uuid(), '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f01', 'in', 5) $$,
  '42501', NULL, 'movements are written only by stock_record()');

-- Receiving and using
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f01', 'in', 10) $$, 'staff record a delivery');
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f02', 'in', 100) $$, 'and another');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'FLOUR'), 10.000, 'a delivery adds to stock');
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f01', 'use', 1.5) $$, 'staff record use');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'FLOUR'), 8.500, 'use takes from stock');
select throws_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f01', 'use', 9) $$,
  'not_enough', 'cannot use more than there is');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'FLOUR'), 8.500, 'a refused use changes nothing');
select throws_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f01', 'use', 0) $$,
  'bad_qty', 'the amount must be above zero');
select throws_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f02', 'loss', 1) $$,
  'bad_reason', 'waste needs a reason');
select throws_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f01', 'sell', 1) $$,
  'bad_type', 'only products are made or sold');

-- Making: product up, ingredients down by the recipe, in one go
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f03', 'make', 100) $$, 'staff make 100 donuts');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'DONUT'), 100.000, 'products go up');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'FLOUR'), 2.500, 'flour goes down by 0.06 × 100');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'EGG'), 50.000, 'eggs go down by 0.5 × 100');
select is((select count(*)::int from public.stock_movements where batch_id = (select batch_id from public.stock_movements where type = 'make' and item_id = '00000000-0000-0000-0000-000000000f03')), 3,
  'the product and its two ingredients are one batch');
select throws_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f03', 'make', 50) $$,
  'not_enough', 'making more than the flour allows is refused');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'EGG'), 50.000, 'a refused make leaves the eggs (which were enough) untouched');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'DONUT'), 100.000, 'and adds no products');

-- Selling and waste
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f03', 'sell', 60) $$, 'staff record a sale');
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f03', 'loss', 5, 'unsold') $$, 'and waste');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'DONUT'), 35.000, 'sales and waste take from stock');

-- The same POS sale twice counts once
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f03', 'sell', 3, null, null, '', 'pos_import', 'R-001') $$, 'an imported sale');
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f03', 'sell', 3, null, null, '', 'pos_import', 'R-001') $$, 'the same sale again');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'DONUT'), 32.000, 'is taken from stock only once');

-- Transfer to B (which has a PIN): B gets the item, the total across branches stays the same
select lives_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000f02', 'transfer', 20, null, '00000000-0000-0000-0000-0000000000b1') $$,
  'staff send eggs to B');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'EGG') + pg_temp.qty('00000000-0000-0000-0000-0000000000b1', 'EGG'), 50.000,
  'eggs in A + B are the same as before the transfer');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000b1', 'EGG'), 20.000, 'B got the item it did not have');

-- B is locked for staff until they type its PIN
select is((select count(*)::int from public.stock_items where branch_id = '00000000-0000-0000-0000-0000000000b1'), 0, 'staff cannot read a PIN branch');
select throws_ok($$ select public.stock_record('00000000-0000-0000-0000-0000000000b1', (select id from public.stock_items limit 1), 'use', 1) $$,
  'no_access', 'nor record in it');
select ok(public.unlock_branch('00000000-0000-0000-0000-0000000000b1', '4321'), 'staff open B with its PIN');
select is((select count(*)::int from public.stock_movements where branch_id = '00000000-0000-0000-0000-0000000000b1'), 1, 'then B''s history shows');

-- Stocktaking (20260929001600_stock_take.sql): staff count A; differences become adjustments; TAX month-end stock
create function pg_temp.tax_stock(b uuid, m text) returns numeric language sql security definer as $$
  select amount from public.stock_counts where branch_id = b and month = m
$$;
select throws_ok($$ select public.stock_take('00000000-0000-0000-0000-0000000000a1',
  '[{"item_id":"00000000-0000-0000-0000-000000000f01","counted":-1}]') $$, 'bad_qty', 'a count cannot be negative');
select throws_ok($$ select public.stock_take('00000000-0000-0000-0000-0000000000a1',
  (select jsonb_build_array(jsonb_build_object('item_id', id, 'counted', 1)) from public.stock_items where branch_id = '00000000-0000-0000-0000-0000000000b1' limit 1)) $$,
  'no_item', 'only items of the branch being counted');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'FLOUR'), 2.500, 'a refused count changes nothing');
-- Book: flour 2.5 kg (48 ฿), eggs 30 (4.5 ฿), donuts 32 (38 ฿). Counted: flour 2, eggs 31; donuts not counted.
select is((public.stock_take('00000000-0000-0000-0000-0000000000a1',
  '[{"item_id":"00000000-0000-0000-0000-000000000f01","counted":2},{"item_id":"00000000-0000-0000-0000-000000000f02","counted":31}]',
  '2026-09') ->> 'diff_value')::numeric, -19.50, 'staff record a count; the difference is −0.5 × 48 + 1 × 4.5 = −19.50 ฿');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'FLOUR'), 2.000, 'stock now matches the count (flour)');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'EGG'), 31.000, 'stock now matches the count (eggs)');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'DONUT'), 32.000, 'items not counted stay as they are');
select is((select array_agg(type order by type)::text from public.stock_movements where type like 'adjust%' and branch_id = '00000000-0000-0000-0000-0000000000a1'), '{adjust_in,adjust_out}',
  'the differences are adjustment movements');
select is(pg_temp.tax_stock('00000000-0000-0000-0000-0000000000a1', '2026-09'), 1451.50,
  'TAX month-end stock gets the whole stock value: 2 × 48 + 31 × 4.5 + 32 × 38');
reset role;
insert into public.month_locks (month) values ('2026-08');
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is(public.stock_take('00000000-0000-0000-0000-0000000000a1',
  '[{"item_id":"00000000-0000-0000-0000-000000000f01","counted":2}]', '2026-08') ->> 'tax', 'locked', 'a closed month is not changed');
select is(pg_temp.tax_stock('00000000-0000-0000-0000-0000000000a1', '2026-08'), null, 'nothing went into the closed month');
select throws_ok($$ insert into public.stock_takes (branch_id, items, diff_value, stock_value) values ('00000000-0000-0000-0000-0000000000a1', 0, 0, 0) $$,
  '42501', NULL, 'stocktakes are written only by stock_take()');

-- Item import (20260929001700_stock_import.sql): owners only; adds new skus, updates existing ones, keeps typed names
select throws_ok($$ select public.stock_import_items('00000000-0000-0000-0000-0000000000a1', '[{"sku":"X1","unit":"bag"}]') $$,
  'admin_only', 'staff cannot import items');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
update public.stock_items set name_i18n = '{"ja":"強力粉"}' where sku = 'FLOUR' and branch_id = '00000000-0000-0000-0000-0000000000a1';
select throws_ok($$ select public.stock_import_items('00000000-0000-0000-0000-0000000000a1', '[{"sku":"X1","unit":"crate"}]') $$,
  'bad_row', 'an unknown unit is refused');
select is(public.stock_import_items('00000000-0000-0000-0000-0000000000a1', '[
  {"sku":"TD01001","name":{"en":"Wheat Flour","th":"แป้งสาลี"},"unit":"bag","category":"food","supplier":"FOOD PROJECT","unit_cost":910,"vat":true,"pack_size":22500,"pack_unit":"g"},
  {"sku":"FLOUR","name":{"en":"Bread flour"},"unit":"kg","category":"food","unit_cost":50}]'),
  '{"added": 1, "updated": 1, "deactivated": 0}'::jsonb, 'the owner imports a list: one new item, one updated');
select is((select name_i18n from public.stock_items where sku = 'FLOUR' and branch_id = '00000000-0000-0000-0000-0000000000a1'),
  '{"ja":"強力粉","en":"Bread flour"}'::jsonb, 'a name typed before is kept, the new one added');
select is((select array[unit, category, pack_size::text, pack_unit, s.name] from public.stock_items i join public.stock_suppliers s on s.id = i.supplier_id where sku = 'TD01001' and i.branch_id = '00000000-0000-0000-0000-0000000000a1'),
  array['bag', 'food', '22500.000', 'g', 'FOOD PROJECT'], 'unit, category, pack size and supplier are saved');
select is(public.stock_import_items('00000000-0000-0000-0000-0000000000a1', '[{"sku":"TD01001","unit":"bag"}]', true) ->> 'deactivated', '3',
  'items not in the list can be hidden in one go');
select is(pg_temp.qty('00000000-0000-0000-0000-0000000000a1', 'EGG'), 31.000, 'hiding an item keeps its stock and history');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');

-- History is append-only, and strangers see nothing
reset role;
select throws_ok($$ delete from public.stock_movements $$, 'stock movements cannot be changed or removed', 'not even the database owner removes history');
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.stock_items) + (select count(*)::int from public.stock_movements), 0, 'a signed-in stranger sees nothing');

select ok(not has_table_privilege('authenticated', 'public.stock_movements', 'TRUNCATE'), 'signed-in users cannot empty the history');

select * from finish();
rollback;
