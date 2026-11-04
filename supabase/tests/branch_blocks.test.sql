-- One staff member kept out of one branch (…003000_member_branch_blocks.sql). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000b1001', 'boss-b@test.local'),
  ('00000000-0000-0000-0000-0000000b1002', 'kept-out@test.local'),
  ('00000000-0000-0000-0000-0000000b1003', 'other@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-0000000b1001', 'boss-b@test.local', 'Boss', 'admin'),
  ('00000000-0000-0000-0000-0000000b1002', 'kept-out@test.local', 'Kept', 'staff'),
  ('00000000-0000-0000-0000-0000000b1003', 'other@test.local', 'Other', 'staff');
insert into public.branches (id, no, name, sort) values ('00000000-0000-0000-0000-0000000bb001', '00081', 'TEST YUNA 1', 81);
-- a branch without a password, with a day of sales
insert into public.sales (sale_date, channel, gross, vat, branch_id) values ('2001-05-03', 'store', 1070, 70, '00000000-0000-0000-0000-0000000bb001');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

-- Before: every staff member sees the branch (no password)
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1002');
select is((select count(*)::int from public.sales where branch_id = '00000000-0000-0000-0000-0000000bb001'), 1, 'before: the staff member sees the branch');

-- Staff cannot keep themselves (or anyone) in or out
select throws_ok($$ insert into public.member_branch_blocks (user_id, branch_id) values ('00000000-0000-0000-0000-0000000b1003', '00000000-0000-0000-0000-0000000bb001') $$, '42501', NULL, 'staff cannot keep anyone out');

-- The admin keeps one person out
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1001');
select lives_ok($$ insert into public.member_branch_blocks (user_id, branch_id) values ('00000000-0000-0000-0000-0000000b1002', '00000000-0000-0000-0000-0000000bb001') $$, 'an admin keeps one staff member out of a branch');
select is((select count(*)::int from public.sales where branch_id = '00000000-0000-0000-0000-0000000bb001'), 1, 'the admin still sees it');

-- That person: no data, the branch looks locked, and no password opens it
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1002');
select is((select count(*)::int from public.sales where branch_id = '00000000-0000-0000-0000-0000000bb001'), 0, 'the kept-out member sees none of its sales');
select ok('00000000-0000-0000-0000-0000000bb001' in (select public.branches_with_pin()), 'for them the branch asks for a password');
select is(public.unlock_branch('00000000-0000-0000-0000-0000000bb001', '1234'), false, 'any password is "wrong"');
select is((select count(*)::int from public.sales where branch_id = '00000000-0000-0000-0000-0000000bb001'), 0, 'and the branch stays closed');
select is((select count(*)::int from public.member_branch_blocks), 0, 'they cannot see that they are kept out');

-- Everyone else as before
select pg_temp.act_as('00000000-0000-0000-0000-0000000b1003');
select is((select count(*)::int from public.sales where branch_id = '00000000-0000-0000-0000-0000000bb001'), 1, 'other staff still see the branch');
select ok('00000000-0000-0000-0000-0000000bb001' not in (select public.branches_with_pin()), 'and it asks them for no password');

select * from finish();
rollback;
