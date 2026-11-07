-- Keys for a connected AI agent (…004000_bot_keys.sql). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(11);

insert into auth.users (id, email) values ('00000000-0000-0000-0000-0000000c4001', 'owner-k@test.local');
insert into public.members (user_id, email, name, role) values ('00000000-0000-0000-0000-0000000c4001', 'owner-k@test.local', 'Owner', 'admin');
update public.members set owner = true where user_id = '00000000-0000-0000-0000-0000000c4001';
insert into public.bot_keys (name, key_hash, hint) values ('Grok Bot', repeat('a', 64), 'sk_sawa_test');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

-- Server only: not even an owner reads or writes the keys from the browser
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000c4001');
select throws_ok($$ select * from public.bot_keys $$, '42501', NULL, 'an owner cannot read the keys from the browser');
select throws_ok($$ insert into public.bot_keys (name, key_hash, hint) values ('x', repeat('b', 64), 'sk_x') $$, '42501', NULL, 'nor make one there');
set local role anon;
select throws_ok($$ select * from public.bot_keys $$, '42501', NULL, 'anonymous: no');
reset role;

-- Only a hash is kept, and the same key once
select throws_ok($$ insert into public.bot_keys (name, key_hash, hint) values ('x', 'not-a-hash', 'sk_x') $$, '23514', NULL, 'the key is stored only as a SHA-256 hex');
select throws_ok($$ insert into public.bot_keys (name, key_hash, hint) values ('x', repeat('a', 64), 'sk_x') $$, '23505', NULL, 'one row per key');

-- The agent's calendar dates are marked as its own
select lives_ok($$ insert into public.calendar_events (title, date, source) values ('Grok: supplier call', '2001-05-03', 'bot') $$, 'calendar dates may come from the agent');
select throws_ok($$ insert into public.calendar_events (title, date, source) values ('x', '2001-05-03', 'robot') $$, '23514', NULL, 'unknown sources are still refused');

-- Sign-in connections (…004100_oauth_connect.sql): server only too
insert into public.oauth_clients (client_id, name, redirect_uris) values ('mcp_' || repeat('A', 24), 'Grok Bot', array['grokbot://app/callback']);
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-0000000c4001');
select throws_ok($$ select * from public.oauth_clients $$, '42501', NULL, 'an owner cannot read the sign-in clients from the browser');
select throws_ok($$ select * from public.oauth_codes $$, '42501', NULL, 'nor the one-time codes');
reset role;
select throws_ok($$ insert into public.oauth_codes (code_hash, client_id, redirect_uri, code_challenge, user_id, expires_at) values (repeat('c', 64), 'mcp_' || repeat('A', 24), 'x', 'short', '00000000-0000-0000-0000-0000000c4001', now()) $$, '23514', NULL, 'a PKCE challenge is 43 characters');
select lives_ok($$ insert into public.bot_keys (name, key_hash, hint, client_id) values ('Grok Bot (sign-in)', repeat('d', 64), 'sk_sawa_d', 'mcp_' || repeat('A', 24)) $$, 'a key remembers which sign-in made it');

select * from finish();
rollback;
