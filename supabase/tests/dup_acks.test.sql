-- "문제없음" on the duplicates popup (…005000_dup_acks.sql). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000da001', 'boss-d@test.local'),
  ('00000000-0000-0000-0000-0000000da002', 'staff-d@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-0000000da001', 'boss-d@test.local', 'Boss', 'admin'),
  ('00000000-0000-0000-0000-0000000da002', 'staff-d@test.local', 'Staff', 'staff');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-0000000da001');
select lives_ok($$ insert into public.dup_acks (key) values ('sale:test-a|test-b') $$, 'an admin marks a duplicate as fine');
select is((select count(*)::int from public.dup_acks where key = 'sale:test-a|test-b'), 1, 'admins read the marks');
update public.dup_acks set key = 'sale:x|y' where key = 'sale:test-a|test-b';
select is((select count(*)::int from public.dup_acks where key = 'sale:test-a|test-b'), 1, 'nobody edits a mark (no update rule)');

select pg_temp.act_as('00000000-0000-0000-0000-0000000da002');
select throws_ok($$ insert into public.dup_acks (key) values ('sale:test-c|test-d') $$, '42501', null, 'staff cannot mark');
select is((select count(*)::int from public.dup_acks), 0, 'staff read no marks');

select * from finish();
rollback;
