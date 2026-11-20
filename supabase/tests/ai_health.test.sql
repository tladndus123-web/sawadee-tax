-- AI reading health lines are server only (…005100_ai_health.sql). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(3);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000ae001', 'boss-h@test.local');
insert into public.members (user_id, email, name, role) values ('00000000-0000-0000-0000-0000000ae001', 'boss-h@test.local', 'Boss', 'admin');
insert into public.ai_health (ok, code) values (false, 'aiFail');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000ae001');
select throws_ok($$ select count(*) from public.ai_health $$, '42501', null, 'even an admin cannot read the health lines from the app');
select throws_ok($$ insert into public.ai_health (ok) values (true) $$, '42501', null, 'nor write them');
reset role;
select is((select count(*)::int from public.ai_health where code = 'aiFail'), 1, 'the server keeps them');

select * from finish();
rollback;
