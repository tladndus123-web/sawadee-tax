-- AI notes and the calendar subscription secret (…003600). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(10);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000d1001', 'boss-d@test.local'),
  ('00000000-0000-0000-0000-0000000d1002', 'staff-d@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-0000000d1001', 'boss-d@test.local', 'Boss', 'admin'),
  ('00000000-0000-0000-0000-0000000d1002', 'staff-d@test.local', 'Staff', 'staff');
insert into public.ai_notes (key, body, stamp) values ('brief:2001-01-01:ko', '{"items":[]}', 's1');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

select pg_temp.act_as('00000000-0000-0000-0000-0000000d1002');
select is((select count(*)::int from public.ai_notes where key = 'brief:2001-01-01:ko'), 0, 'staff do not read the AI notes');
select throws_like($$ select public.calendar_feed_token() $$, 'admin_only%', 'staff cannot get the calendar address');
select throws_ok($$ select token from public.calendar_feed $$, '42501', NULL, 'nor read it');

select pg_temp.act_as('00000000-0000-0000-0000-0000000d1001');
select is((select count(*)::int from public.ai_notes where key = 'brief:2001-01-01:ko'), 1, 'admins read the AI notes');
select throws_ok($$ insert into public.ai_notes (key, body) values ('x', '{}') $$, '42501', NULL, 'nobody writes them from the app');
create temp table t1 as select public.calendar_feed_token() as v;
select ok((select length(v) from t1) >= 32, 'an admin gets a long secret');
select is(public.calendar_feed_token(), (select v from t1), 'asking again gives the same one');
select isnt(public.calendar_feed_token(true), (select v from t1), 'renewing gives a new one');

create temp table t2 as select public.calendar_feed_token(false, 2) as v;
select isnt((select v from t2), public.calendar_feed_token(), 'the staff schedule has its own secret');
select throws_like($$ select public.calendar_feed_token(false, 3) $$, 'bad_feed%', 'only two feeds');

select * from finish();
rollback;
