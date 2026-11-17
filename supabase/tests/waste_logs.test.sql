-- Waste log (…004600_waste_logs.sql). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c4001', 'w-boss@test.local'),
  ('00000000-0000-0000-0000-0000000c4002', 'w-cook@test.local'),
  ('00000000-0000-0000-0000-0000000c4003', 'w-kept@test.local'),
  ('00000000-0000-0000-0000-0000000c4004', 'w-other@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-0000000c4001', 'w-boss@test.local', 'Boss', 'admin'),
  ('00000000-0000-0000-0000-0000000c4002', 'w-cook@test.local', 'Cook', 'staff'),
  ('00000000-0000-0000-0000-0000000c4003', 'w-kept@test.local', 'Kept', 'staff'),
  ('00000000-0000-0000-0000-0000000c4004', 'w-other@test.local', 'Other', 'staff');
update public.members set owner = true where user_id = '00000000-0000-0000-0000-0000000c4001';
insert into public.branches (id, no, name, sort) values ('00000000-0000-0000-0000-0000000cc401', '00091', 'TEST WASTE', 91);
insert into public.member_branch_blocks (user_id, branch_id) values ('00000000-0000-0000-0000-0000000c4003', '00000000-0000-0000-0000-0000000cc401');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

-- A cook records milk thrown away
select pg_temp.act_as('00000000-0000-0000-0000-0000000c4002');
select lives_ok($$ insert into public.waste_logs (id, branch_id, item, qty, unit, amount, reason) values ('00000000-0000-0000-0000-0000000ce401', '00000000-0000-0000-0000-0000000cc401', 'นม', 2, 'L', 90, 'spoiled') $$, 'staff record waste in a branch they see');
select throws_ok($$ insert into public.waste_logs (branch_id, item, qty, reason) values ('00000000-0000-0000-0000-0000000cc401', 'x', 0, 'spoiled') $$, '23514', NULL, 'quantity must be more than 0');
select throws_ok($$ insert into public.waste_logs (branch_id, item, reason) values ('00000000-0000-0000-0000-0000000cc401', 'x', 'stolen') $$, '23514', NULL, 'only the known reasons');
select throws_ok($$ insert into public.waste_logs (branch_id, item, photo_path) values ('00000000-0000-0000-0000-0000000cc401', 'x', 'receipts/a.jpg') $$, '23514', NULL, 'photos only under waste/');

-- Someone kept out of the branch sees nothing there and cannot record
select pg_temp.act_as('00000000-0000-0000-0000-0000000c4003');
select is((select count(*)::int from public.waste_logs where branch_id = '00000000-0000-0000-0000-0000000cc401'), 0, 'a kept-out member sees none of that branch');
select throws_ok($$ insert into public.waste_logs (branch_id, item) values ('00000000-0000-0000-0000-0000000cc401', 'x') $$, '42501', NULL, 'a kept-out member cannot record there');

-- Another staff member sees it but cannot change someone else's line
select pg_temp.act_as('00000000-0000-0000-0000-0000000c4004');
select is((select count(*)::int from public.waste_logs where id = '00000000-0000-0000-0000-0000000ce401'), 1, 'other staff of the branch see the line');
update public.waste_logs set qty = 9 where id = '00000000-0000-0000-0000-0000000ce401';
select is((select qty from public.waste_logs where id = '00000000-0000-0000-0000-0000000ce401'), 2::numeric, 'other staff cannot change it');

-- The owner can
select pg_temp.act_as('00000000-0000-0000-0000-0000000c4001');
delete from public.waste_logs where id = '00000000-0000-0000-0000-0000000ce401';
select is((select count(*)::int from public.waste_logs where id = '00000000-0000-0000-0000-0000000ce401'), 0, 'an admin of the branch removes it');

-- LINE waste mode (…004800): the mode and a waiting photo are accepted, other photo paths are not
reset role;
select lives_ok($$ insert into public.line_modes (line_user_id, mode, until, photo_path) values ('Utestwaste01', 'waste', now() + interval '10 minutes', 'waste/x/line.jpg') $$, 'line_modes takes waste mode with a waiting photo');

select * from finish();
rollback;
