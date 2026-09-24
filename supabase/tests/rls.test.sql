-- RLS / trigger rules. Run: npm run db:test  (supabase test db, pgTAP; everything rolls back)
begin;
create extension if not exists pgtap with schema extensions;
select plan(18);

-- Fixtures: one admin, one staff, one signed-in stranger (no membership)
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@test.local'),
  ('00000000-0000-0000-0000-00000000000c', 'stranger@test.local');
insert into public.members (user_id, email, name, role) values
  ('00000000-0000-0000-0000-00000000000a', 'admin@test.local', 'Admin', 'admin'),
  ('00000000-0000-0000-0000-00000000000b', 'staff@test.local', 'Staff', 'staff');

-- Only the test admin is an admin inside this (rolled-back) test
update public.members set role = 'staff' where user_id <> '00000000-0000-0000-0000-00000000000a';

create function pg_temp.act_as(uid uuid) returns void language sql as $$
  select set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
$$;

set local role authenticated;

-- Staff adds and edits; the database stamps who did it
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ select public.save_document('00000000-0000-0000-0000-0000000000d1', '{"doc_no":"T-1","status":"draft","net":107}', '[{"line_no":1,"amount":100}]') $$, 'staff can add a document');
select is((select created_by::text from public.documents where id = '00000000-0000-0000-0000-0000000000d1'), '00000000-0000-0000-0000-00000000000b', 'created_by is stamped by the database');
select lives_ok($$ select public.save_document('00000000-0000-0000-0000-0000000000d1', '{"doc_no":"T-1","status":"reviewed","net":107}', '[]') $$, 'staff can edit');
select is((select count(*)::int from public.document_items where document_id = '00000000-0000-0000-0000-0000000000d1'), 0, 'items are replaced on save');
select throws_ok($$ update public.documents set deleted_at = now(), deleted_by = auth.uid(), delete_reason = 'dup' where id = '00000000-0000-0000-0000-0000000000d1' $$,
  'only admins can delete or restore documents', 'staff cannot soft delete');
with d as (delete from public.documents where id = '00000000-0000-0000-0000-0000000000d1' returning 1)
select is((select count(*)::int from d), 0, 'nobody can hard delete (no delete policy)');
select throws_ok($$ update public.members set role = 'admin' where user_id = auth.uid() $$, 'only admins can change roles', 'staff cannot promote themselves');
with u as (update public.company_settings set tax_id = '123' where id = 1 returning 1)
select is((select count(*)::int from u), 0, 'staff cannot change company settings');

-- Admin soft-deletes with a reason; staff can no longer see it; admin restores
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.documents set deleted_at = now(), deleted_by = auth.uid(), delete_reason = ' ' where id = '00000000-0000-0000-0000-0000000000d1' $$,
  '23514', NULL, 'a reason is required');
select lives_ok($$ update public.documents set deleted_at = now(), deleted_by = auth.uid(), delete_reason = 'Issued twice' where id = '00000000-0000-0000-0000-0000000000d1' $$, 'admin can soft delete');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.documents where id = '00000000-0000-0000-0000-0000000000d1'), 0, 'staff do not see the trash');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ update public.documents set deleted_at = null, deleted_by = null, delete_reason = null where id = '00000000-0000-0000-0000-0000000000d1' $$, 'admin can restore');
select is((select array_agg(action order by id)::text from public.document_events where document_id = '00000000-0000-0000-0000-0000000000d1'),
  '{create,update,delete,restore}', 'every step is in the audit trail');
select throws_ok($$ update public.members set role = 'staff' where user_id = auth.uid() $$, 'at least one admin is required', 'the last admin cannot step down');

-- Vendor dictionary: the first document creates the vendor, later ones do not overwrite its name
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.save_document('00000000-0000-0000-0000-0000000000d2',
  '{"doc_no":"V-1","seller":{"taxId":"9900000000014","name":{"th":"บริษัท แพนฟู้ด จำกัด","en":"PANFOOD CO., LTD.","ja":""},"address":{"th":"","en":"","ja":""}}}', '[]');
select is((select name ->> 'en' from public.vendors where tax_id = '9900000000014'), 'PANFOOD CO., LTD.', 'saving a document registers its vendor');
select public.save_document(null,
  '{"doc_no":"V-2","seller":{"taxId":"9-9000-00000-01-4","name":{"th":"แพนฟู้ด","en":"Panfood typo","ja":""},"address":{"th":"ถนน 1","en":"","ja":""}}}', '[]');
select is((select name ->> 'en' || ' | ' || (address ->> 'th') from public.vendors where tax_id = '9900000000014'), 'PANFOOD CO., LTD. | ถนน 1',
  'later documents keep the dictionary name and only fill empty fields');
select is((select count(distinct vendor_id)::int from public.documents where doc_no in ('V-1', 'V-2')), 1, 'both documents link to the same vendor');

-- A signed-in person who is not a member sees nothing
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select is((select count(*)::int from public.documents), 0, 'non-members see no documents');

select * from finish();
rollback;
