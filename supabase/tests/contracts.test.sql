-- Contract box (…004700_contracts.sql): admins only, sane dates, files in contracts/ added by admins only, LINE contract
-- mode allowed. Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(14);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000c7001', 'boss-c@test.local'),
  ('00000000-0000-0000-0000-0000000c7002', 'staff-c@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-0000000c7001', 'boss-c@test.local', 'Boss', 'admin'),
  ('00000000-0000-0000-0000-0000000c7002', 'staff-c@test.local', 'Staff', 'staff');

-- One contract made by the service role (no session)
insert into public.contracts (id, title, party, kind, start_on, end_on, amount)
values ('00000000-0000-0000-0000-0000000c7101', 'Shop lease', 'Landlord Co.', 'lease', '2026-01-01', '2026-12-31', 4500000);

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

-- Staff: nothing
select pg_temp.act_as('00000000-0000-0000-0000-0000000c7002');
select is((select count(*)::int from public.contracts), 0, 'staff read no contracts');
select throws_ok($$ insert into public.contracts (title) values ('Staff contract') $$, '42501', NULL, 'staff cannot add a contract');
update public.contracts set title = 'changed' where id = '00000000-0000-0000-0000-0000000c7101';
delete from public.contracts where id = '00000000-0000-0000-0000-0000000c7101';
select throws_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('documents', 'contracts/00000000-0000-0000-0000-0000000c7101/a.pdf', auth.uid()) $$,
  '42501', NULL, 'staff cannot put a file in the contracts folder');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('documents', 'c7test/receipt.jpg', auth.uid()) $$,
  'staff still add receipt photos elsewhere');

-- Admins: everything
select pg_temp.act_as('00000000-0000-0000-0000-0000000c7001');
select is((select title from public.contracts where id = '00000000-0000-0000-0000-0000000c7101'), 'Shop lease', 'staff changed nothing, admins read it');
select lives_ok($$ insert into public.contracts (id, title, kind, end_on) values ('00000000-0000-0000-0000-0000000c7102', 'Cleaning', 'service', '2027-03-31') $$, 'admins add a contract');
select is((select created_by from public.contracts where id = '00000000-0000-0000-0000-0000000c7102'), '00000000-0000-0000-0000-0000000c7001'::uuid, 'created_by is the admin');
select lives_ok($$ update public.contracts set note = 'monthly' where id = '00000000-0000-0000-0000-0000000c7102' $$, 'admins change a contract');
select lives_ok(
  $$ insert into storage.objects (bucket_id, name, owner) values ('documents', 'contracts/00000000-0000-0000-0000-0000000c7102/scan.pdf', auth.uid()) $$,
  'admins put a file in the contracts folder');
select is((select count(*)::int from storage.objects where name = 'contracts/00000000-0000-0000-0000-0000000c7102/scan.pdf'), 1, 'admins read the contract file');

-- Bad values are refused
select throws_ok($$ insert into public.contracts (title, start_on, end_on) values ('Backwards', '2026-05-01', '2026-04-30') $$, '23514', NULL, 'an end before the start is refused');
select throws_ok($$ insert into public.contracts (title, kind) values ('Odd', 'marriage') $$, '23514', NULL, 'an unknown kind is refused');

select lives_ok($$ delete from public.contracts where id = '00000000-0000-0000-0000-0000000c7102' $$, 'admins remove a contract');

-- LINE contract mode is allowed (server only)
reset role;
select lives_ok($$ insert into public.line_modes (line_user_id, mode, until) values ('Uc7test0001', 'contract', now() + interval '10 minutes') $$, 'line_modes accepts contract mode');

select * from finish();
rollback;
