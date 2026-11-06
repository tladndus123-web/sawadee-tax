-- Tax calendar (…002500_company_calendar.sql) and expense claims (…002600_expense_claims.sql, …002700). Run: npm run db:test
-- Everything rolls back; the claims are dated in 2001 so they never touch a real month.
begin;
create extension if not exists pgtap with schema extensions;
select plan(28);

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-0000000e0a01', 'boss@test.local'),
  ('00000000-0000-0000-0000-0000000e0a02', 'staff1@test.local'),
  ('00000000-0000-0000-0000-0000000e0a03', 'staff2@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-0000000e0a01', 'boss@test.local', 'Boss', 'admin'),
  ('00000000-0000-0000-0000-0000000e0a02', 'staff1@test.local', 'Som', 'staff'),
  ('00000000-0000-0000-0000-0000000e0a03', 'staff2@test.local', 'Mai', 'staff');

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;
set local role authenticated;

-- ── Calendar: admins only ──
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a01');
select lives_ok($$ insert into public.calendar_events (title, date, repeat, amount, source) values ('Shop lease renewal', '2027-03-01', 'yearly', 4500000, 'document') $$, 'an admin adds a company date');
select throws_ok($$ insert into public.calendar_events (title, date, repeat) values ('x', '2027-03-01', 'weekly') $$, '23514', NULL, 'once, monthly or yearly');
select lives_ok($$ insert into public.calendar_done (key) values ('vat:2001-09') $$, 'and ticks an item off');
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a02');
select is((select count(*)::int from public.calendar_events) + (select count(*)::int from public.calendar_done where key = 'vat:2001-09'), 0, 'staff do not see the calendar');
select throws_ok($$ insert into public.calendar_events (title, date) values ('Mine', '2027-01-01') $$, '42501', NULL, 'nor add to it');

-- ── Expense claims ──
select lives_ok($$ insert into public.expense_claims (id, name, day, seller, amount, status) values ('00000000-0000-0000-0000-0000000e0c01', 'Som', '2001-05-02', 'Makro', 120000, 'approved') $$, 'a member claims an expense');
select is((select status from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c01'), 'pending', 'it waits, whatever they asked for');
select is((select user_id::text from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c01'), '00000000-0000-0000-0000-0000000e0a02', 'and is theirs');
select ok((select branch_id is not null from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c01'), 'in a branch');
select throws_like($$ update public.expense_claims set status = 'approved' where id = '00000000-0000-0000-0000-0000000e0c01' $$, '%only an admin decides%', 'they cannot approve it');
select lives_ok($$ update public.expense_claims set note = 'cleaning things' where id = '00000000-0000-0000-0000-0000000e0c01' $$, 'but can change it while it waits');

select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a03');
select is((select count(*)::int from public.expense_claims), 0, 'another member does not see it');

select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a01');
select is((select count(*)::int from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c01'), 1, 'an admin sees every claim');
select lives_ok($$ update public.expense_claims set status = 'approved' where id = '00000000-0000-0000-0000-0000000e0c01' $$, 'and approves it');
select is((select decided_by::text from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c01'), '00000000-0000-0000-0000-0000000e0a01', 'stamped with who decided');
select lives_ok($$ update public.expense_claims set status = 'paid', paid_how = 'cash' where id = '00000000-0000-0000-0000-0000000e0c01' $$, 'and marks it paid back');

-- Paid back with the pay (…003800): linked to the employee by an admin, only while it is paid with the pay
insert into public.employees (id, name, rate, pay_type) values ('00000000-0000-0000-0000-0000000e0e01', 'Som', 15000, 'monthly');
update public.expense_claims set paid_how = 'payroll', employee_id = '00000000-0000-0000-0000-0000000e0e01' where id = '00000000-0000-0000-0000-0000000e0c01';
select is((select employee_id::text from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c01'), '00000000-0000-0000-0000-0000000e0e01', 'an admin pays a claim with an employee''s pay');
update public.expense_claims set paid_how = 'cash' where id = '00000000-0000-0000-0000-0000000e0c01';
select is((select employee_id from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c01'), null, 'paid another way, the link goes');

select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a02');
with d as (delete from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c01' returning 1)
select is((select count(*)::int from d), 0, 'a paid claim cannot be removed by its member');

-- Small claims approved by themselves; a rejected claim is never paid
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a01');
update public.company_settings set expenses = '{"autoUnder": 100}' where id = 1;
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a03');
insert into public.expense_claims (id, name, day, amount) values ('00000000-0000-0000-0000-0000000e0c02', 'Mai', '2001-05-03', 8000);
select is((select status from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c02'), 'approved', 'a claim under the company''s amount is approved by itself');
insert into public.expense_claims (id, name, day, amount, employee_id) values ('00000000-0000-0000-0000-0000000e0c03', 'Mai', '2001-05-03', 900000, '00000000-0000-0000-0000-0000000e0e01');
select is((select employee_id from public.expense_claims where id = '00000000-0000-0000-0000-0000000e0c03'), null, 'a member cannot link their claim to an employee''s pay');
select throws_like($$ update public.expense_claims set employee_id = '00000000-0000-0000-0000-0000000e0e01' where id = '00000000-0000-0000-0000-0000000e0c03' $$, '%only an admin decides%', 'nor later');

-- The receipt photo of a waiting claim (…003900): its member sees it, another member does not
reset role;
insert into storage.objects (bucket_id, name) values ('documents', '00000000-0000-0000-0000-0000000e0c03/receipt.jpg');
set local role authenticated;
select is((select count(*)::int from storage.objects where name = '00000000-0000-0000-0000-0000000e0c03/receipt.jpg'), 1, 'a member sees the photo of their own waiting claim');
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a02');
select is((select count(*)::int from storage.objects where name = '00000000-0000-0000-0000-0000000e0c03/receipt.jpg'), 0, 'another member does not');
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a03');
select pg_temp.act_as('00000000-0000-0000-0000-0000000e0a01');
update public.expense_claims set status = 'rejected' where id = '00000000-0000-0000-0000-0000000e0c02';
select throws_like($$ update public.expense_claims set status = 'paid' where id = '00000000-0000-0000-0000-0000000e0c02' $$, '%rejected claim is not paid%', 'a rejected claim is never paid');

-- Server-only expense mode on LINE
select throws_ok($$ select count(*) from public.line_modes $$, '42501', NULL, 'signed-in users cannot read the LINE modes');

-- A ledger document moved to a claim (…002700): one claim per document
select has_index('public', 'expense_claims', 'expense_claims_one_per_document', 'a document can be moved to a claim');
select index_is_unique('public', 'expense_claims', 'expense_claims_one_per_document', 'only once');

select * from finish();
rollback;
