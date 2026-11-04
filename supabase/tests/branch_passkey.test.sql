-- Opening a branch with quick sign-in (…003100_branch_passkey.sql). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c1001', 'boss-c@test.local'),
  ('00000000-0000-0000-0000-0000000c1002', 'staff-c@test.local'),
  ('00000000-0000-0000-0000-0000000c1003', 'kept-c@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-0000000c1001', 'boss-c@test.local', 'Boss', 'admin'),
  ('00000000-0000-0000-0000-0000000c1002', 'staff-c@test.local', 'Staff', 'staff'),
  ('00000000-0000-0000-0000-0000000c1003', 'kept-c@test.local', 'Kept', 'staff');
insert into public.branches (id, no, name, sort) values ('00000000-0000-0000-0000-0000000cc001', '00082', 'TEST PASSKEY', 82);
insert into public.branch_pins (branch_id, pin_hash) values ('00000000-0000-0000-0000-0000000cc001', extensions.crypt('4321', extensions.gen_salt('bf')));
insert into public.member_branch_blocks (user_id, branch_id) values ('00000000-0000-0000-0000-0000000c1003', '00000000-0000-0000-0000-0000000cc001');
insert into public.sales (sale_date, channel, gross, vat, branch_id) values ('2001-06-03', 'store', 1070, 70, '00000000-0000-0000-0000-0000000cc001');

-- Signed in as uid by `method`, `ago` seconds ago
create function pg_temp.act_as(uid uuid, method text, ago int) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated',
           'amr', json_build_array(json_build_object('method', method, 'timestamp', extract(epoch from now())::bigint - ago)))::text, true);
$$;
set local role authenticated;

-- Email sign-in: not a passkey
select pg_temp.act_as('00000000-0000-0000-0000-0000000c1002', 'otp', 5);
select is(public.passkey_fresh(), false, 'an email sign-in is not a passkey');
select is(public.unlock_branch_passkey('00000000-0000-0000-0000-0000000cc001'), false, 'it does not open the branch');
select is((select count(*)::int from public.sales where branch_id = '00000000-0000-0000-0000-0000000cc001'), 0, 'the branch stays closed');

-- A passkey sign-in an hour ago: too old
select pg_temp.act_as('00000000-0000-0000-0000-0000000c1002', 'passkey', 3600);
select is(public.unlock_branch_passkey('00000000-0000-0000-0000-0000000cc001'), false, 'an old passkey sign-in does not open it');

-- A passkey sign-in just now: opens it
select pg_temp.act_as('00000000-0000-0000-0000-0000000c1002', 'passkey', 5);
select is(public.passkey_fresh(), true, 'a passkey sign-in just now counts');
select is(public.unlock_branch_passkey('00000000-0000-0000-0000-0000000cc001'), true, 'it opens the branch');
select is((select count(*)::int from public.sales where branch_id = '00000000-0000-0000-0000-0000000cc001'), 1, 'and the branch is open');

-- Kept out of the branch: the passkey "fails" too
select pg_temp.act_as('00000000-0000-0000-0000-0000000c1003', 'passkey', 5);
select is(public.unlock_branch_passkey('00000000-0000-0000-0000-0000000cc001'), false, 'a kept-out member cannot open it with a passkey');
select is((select count(*)::int from public.sales where branch_id = '00000000-0000-0000-0000-0000000cc001'), 0, 'and still sees nothing');

-- Admins: a fresh passkey sign-in is accepted
select pg_temp.act_as('00000000-0000-0000-0000-0000000c1001', 'passkey', 5);
select is(public.unlock_branch_passkey('00000000-0000-0000-0000-0000000cc001'), true, 'admins pass with a fresh passkey');

select * from finish();
rollback;
