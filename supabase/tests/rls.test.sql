-- RLS / trigger rules. Run: npm run db:test  (supabase test db, pgTAP; everything rolls back)
begin;
create extension if not exists pgtap with schema extensions;
select plan(67);

-- Original PDFs (e-Tax Invoices) are kept next to the photos
select ok((select 'application/pdf' = any(allowed_mime_types) from storage.buckets where id = 'documents'), 'the documents bucket keeps original PDFs');


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
  select set_config('request.jwt.claim.sub', uid::text, true),
         set_config('request.jwt.claims', json_build_object('sub', uid, 'role', 'authenticated')::text, true);
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

-- LINE: accounts are linked only with a one-time code through the bot; the bot saves as the member
select throws_ok($$ update public.members set line_user_id = 'U-hijack' where user_id = auth.uid() $$,
  'LINE accounts are linked through the bot', 'members cannot set a LINE account themselves');
select ok((select public.line_link_code() ~ '^\d{6}$'), 'members get a 6-digit link code');
select is((select count(*)::int from public.line_link_codes), 0, 'link codes are not readable in the app');
select throws_ok($$ select public.line_link('000000', 'U-staff') $$, '42501', NULL, 'only the bot can use a code');
reset role;
select is(public.line_link((select code from public.line_link_codes where user_id = '00000000-0000-0000-0000-00000000000b'), 'U-staff')::text,
  '00000000-0000-0000-0000-00000000000b', 'the bot links the member with their code');
select is(public.line_link((select code from public.line_link_codes limit 1), 'U-staff'), NULL, 'a code works only once');
insert into public.line_messages (message_id, user_id) values ('m-1', '00000000-0000-0000-0000-00000000000b');
select public.line_save_document('00000000-0000-0000-0000-00000000000b', 'm-1', '00000000-0000-0000-0000-0000000000d3', '{"doc_no":"L-1","status":"reviewed"}', '[]');
select is((select d.created_by::text || ' ' || e.user_id::text || ' ' || m.document_id::text
             from public.documents d join public.document_events e on e.document_id = d.id join public.line_messages m on m.document_id = d.id
            where d.id = '00000000-0000-0000-0000-0000000000d3'),
  '00000000-0000-0000-0000-00000000000b 00000000-0000-0000-0000-00000000000b 00000000-0000-0000-0000-0000000000d3',
  'a LINE photo is saved and logged as the member who sent it');
set local role authenticated;
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ update public.members set line_user_id = null where user_id = auth.uid() $$, 'members can unlink themselves');

-- Access removal (people who leave): admin only, with a reason, never yourself; a removed member sees nothing
with u as (update public.members set disabled_at = now(), disable_reason = 'left' where user_id = '00000000-0000-0000-0000-00000000000a' returning 1)
select is((select count(*)::int from u), 0, 'staff cannot remove anyone');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.members set disabled_at = now(), disable_reason = 'me' where user_id = auth.uid() $$,
  'you cannot remove your own access', 'admins cannot remove themselves');
select throws_ok($$ update public.members set disabled_at = now() where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  '23514', NULL, 'a reason is required');
select lives_ok($$ update public.members set disabled_at = now(), disable_reason = 'Left the company' where user_id = '00000000-0000-0000-0000-00000000000b' $$,
  'an admin removes access with a reason');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.documents), 0, 'a removed member sees no documents');
with u as (update public.members set disabled_at = null, disable_reason = null where user_id = auth.uid() returning 1)
select is((select count(*)::int from u), 0, 'a removed member cannot restore themselves');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ update public.members set disabled_at = null where user_id = '00000000-0000-0000-0000-00000000000b' $$, 'an admin restores access');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select ok((select count(*) from public.documents) > 0, 'restored member sees the ledger again');

-- Month close: an admin closes a filed month; its saved documents are frozen except payment and stickers
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.save_document('00000000-0000-0000-0000-0000000000e1', '{"doc_no":"M-1","status":"reviewed","doc_date":"2026-08-10","net":100}', '[{"line_no":1,"amount":100}]');
select public.save_document('00000000-0000-0000-0000-0000000000e2', '{"doc_no":"M-2","status":"draft","doc_date":"2026-08-11"}', '[]');
select throws_ok($$ insert into public.month_locks (month) values ('2026-08') $$, '42501', NULL, 'staff cannot close a month');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.month_locks (month) values ('2026-08') $$, 'an admin closes a month');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select throws_like($$ select public.save_document('00000000-0000-0000-0000-0000000000e1', '{"net":200}', '[]') $$, 'month_locked%', 'a closed month''s document cannot be changed');
select throws_like($$ select public.save_document(null, '{"doc_no":"M-3","status":"reviewed","doc_date":"2026-08-20"}', '[]') $$, 'month_locked%', 'nothing can be added to a closed month');
select throws_like($$ update public.documents set doc_date = '2026-09-01' where id = '00000000-0000-0000-0000-0000000000e1' $$, 'month_locked%', 'a document cannot be moved out of a closed month');
select throws_like($$ delete from public.document_items where document_id = '00000000-0000-0000-0000-0000000000e1' $$, 'month_locked%', 'its item lines are frozen too');
select lives_ok($$ update public.documents set paid = true, paid_date = '2026-09-05', stickers = '{red}' where id = '00000000-0000-0000-0000-0000000000e1' $$, 'paying and stickers still work in a closed month');
select lives_ok($$ select public.save_document('00000000-0000-0000-0000-0000000000e2', '{"note":"x"}', '[]') $$, 'drafts in a closed month stay editable');
select throws_like($$ select public.save_document('00000000-0000-0000-0000-0000000000e2', '{"status":"reviewed"}', '[]') $$, 'month_locked%', 'a draft cannot be saved into a closed month');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_like($$ update public.documents set deleted_at = now(), delete_reason = 'dup' where id = '00000000-0000-0000-0000-0000000000e1' $$, 'month_locked%', 'even admins cannot delete in a closed month');
-- A late invoice dated in the closed month is claimed in a later, open month
select lives_ok($$ select public.save_document('00000000-0000-0000-0000-0000000000e3', '{"doc_no":"M-4","status":"reviewed","doc_date":"2026-08-25","tax_month":"2026-09"}', '[]') $$, 'a late invoice is saved into an open claim month');
select is((select public.claim_month(tax_month, doc_date) from public.documents where id = '00000000-0000-0000-0000-0000000000e3'), '2026-09', 'it is reported in its claim month');
select throws_like($$ update public.documents set tax_month = '2026-08' where id = '00000000-0000-0000-0000-0000000000e3' $$, 'month_locked%', 'it cannot be moved into the closed month');
select lives_ok($$ delete from public.month_locks where month = '2026-08' $$, 'an admin reopens the month');
select lives_ok($$ select public.save_document('00000000-0000-0000-0000-0000000000e1', '{"net":200}', '[]') $$, 'a reopened month can be edited again');

-- Delete for good: admins only, only from the trash, never a saved document of a closed month; a record stays
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.save_document('00000000-0000-0000-0000-0000000000e5', '{"doc_no":"P-1","status":"reviewed","doc_date":"2026-07-10","net":50}', '[{"line_no":1,"amount":50}]');
select throws_ok($$ select public.purge_document('00000000-0000-0000-0000-0000000000e5') $$, '42501', NULL, 'staff cannot delete for good');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_like($$ select public.purge_document('00000000-0000-0000-0000-0000000000e5') $$, '%trash first%', 'only documents already in the trash');
update public.documents set deleted_at = now(), delete_reason = 'test purge' where id = '00000000-0000-0000-0000-0000000000e5';
insert into public.month_locks (month) values ('2026-07');
select throws_like($$ select public.purge_document('00000000-0000-0000-0000-0000000000e5') $$, 'month_locked%', 'not a saved document of a closed month');
delete from public.month_locks where month = '2026-07';
select lives_ok($$ select public.purge_document('00000000-0000-0000-0000-0000000000e5') $$, 'an admin deletes a trashed document for good');
select is((select count(*)::int from public.documents where id = '00000000-0000-0000-0000-0000000000e5') + (select count(*)::int from public.document_items where document_id = '00000000-0000-0000-0000-0000000000e5'), 0, 'the document and its lines are gone');
select is((select delete_reason from public.document_purges where document_id = '00000000-0000-0000-0000-0000000000e5'), 'test purge', 'a record of what was deleted and why stays');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.document_purges), 0, 'staff cannot read the deletion records');

-- Vendor rules: any member sets category / payment; only admins switch automatic registration
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ update public.vendors set rule_category = 'food', rule_payment = 'credit' where tax_id = '9900000000014' $$, 'staff set a vendor rule');
select throws_ok($$ update public.vendors set rule_category = 'nonsense' where tax_id = '9900000000014' $$, '23514', NULL, 'only known categories');
select throws_ok($$ update public.vendors set auto_register = true where tax_id = '9900000000014' $$, '42501', NULL, 'staff cannot switch on automatic registration');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ update public.vendors set auto_register = true where tax_id = '9900000000014' $$, 'an admin switches on automatic registration');
select is((select auto_register from public.vendors where tax_id = '9900000000014'), true, 'the rule is stored');

-- Vendors: only admins remove a directory entry; documents keep their seller, only the link is cleared
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
delete from public.vendors where tax_id = '9900000000014';
select is((select count(*)::int from public.vendors where tax_id = '9900000000014'), 1, 'staff cannot remove a vendor');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ delete from public.vendors where tax_id = '9900000000014' $$, 'an admin removes a vendor');
select is((select count(*)::int from public.vendors where tax_id = '9900000000014'), 0, 'the vendor is gone');
select is((select count(*)::int from public.documents where doc_no in ('V-1', 'V-2') and vendor_id is null), 2, 'its documents stay, unlinked');

-- A signed-in person who is not a member sees nothing
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.line_link_code() $$, 'members only', 'non-members get no link code');
select is((select count(*)::int from public.documents), 0, 'non-members see no documents');

select * from finish();
rollback;
