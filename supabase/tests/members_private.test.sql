-- Staff do not read the member list (…004400_members_private.sql). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(8);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d5001', 'boss-m@test.local'),
  ('00000000-0000-0000-0000-0000000d5002', 'staff-m@test.local'),
  ('00000000-0000-0000-0000-0000000d5003', 'other-m@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-0000000d5001', 'boss-m@test.local', 'Boss', 'admin'),
  ('00000000-0000-0000-0000-0000000d5002', 'staff-m@test.local', 'Staff', 'staff'),
  ('00000000-0000-0000-0000-0000000d5003', 'other-m@test.local', '', 'staff');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

-- Staff: only their own row
select pg_temp.act_as('00000000-0000-0000-0000-0000000d5002');
select is((select count(*)::int from public.members where email like '%-m@test.local'), 1, 'staff read only their own member row');
select is((select email from public.members where user_id = auth.uid()), 'staff-m@test.local', 'their own row, with their email');
-- … but names for "who checked / deleted", without emails
select is((select count(*)::int from public.member_names() where user_id::text like '00000000-0000-0000-0000-0000000d500%'), 3, 'member_names lists everyone');
select is((select count(*)::int from public.member_names() where email is not null), 0, 'staff never get emails from member_names');
select is((select name from public.member_names() where user_id = '00000000-0000-0000-0000-0000000d5003'), 'other-m', 'a member without a name shows the start of their email');

-- Admins: everyone, with emails
select pg_temp.act_as('00000000-0000-0000-0000-0000000d5001');
select is((select count(*)::int from public.members where email like '%-m@test.local'), 3, 'admins read every member');
select is((select email from public.member_names() where user_id = '00000000-0000-0000-0000-0000000d5002'), 'staff-m@test.local', 'admins get emails from member_names');

-- Nobody signed in: nothing
set local role anon;
select throws_ok($$ select * from public.member_names() $$, '42501', NULL, 'anonymous cannot call member_names');

select * from finish();
rollback;
