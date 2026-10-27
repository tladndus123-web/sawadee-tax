-- Supplier payment terms (…002800_vendor_pay_terms.sql) and the accountant's Excel layout (…002900_excel_format.sql). Run: npm run db:test. Everything rolls back.
begin;
create extension if not exists pgtap with schema extensions;
select plan(5);

insert into public.vendors (id, tax_id) values ('00000000-0000-0000-0000-0000000f0001', '0999999999991');
select lives_ok($$ update public.vendors set pay_terms = 'days:30' where id = '00000000-0000-0000-0000-0000000f0001' $$, 'credit 30 days');
select lives_ok($$ update public.vendors set pay_terms = 'next:25' where id = '00000000-0000-0000-0000-0000000f0001' $$, 'the 25th of next month');
select throws_ok($$ update public.vendors set pay_terms = 'next:32' where id = '00000000-0000-0000-0000-0000000f0001' $$, '23514', NULL, 'no 32nd day');
select throws_ok($$ update public.vendors set pay_terms = 'weekly' where id = '00000000-0000-0000-0000-0000000f0001' $$, '23514', NULL, 'only the known terms');

select has_column('public', 'company_settings', 'excel_format', 'the company keeps the accountant''s Excel layout');

select * from finish();
rollback;
