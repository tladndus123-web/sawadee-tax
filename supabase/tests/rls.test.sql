-- RLS / trigger rules. Run: npm run db:test  (supabase test db, pgTAP; everything rolls back)
begin;
create extension if not exists pgtap with schema extensions;
select plan(126);

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

-- "문제 없음": staff accept a document's warnings, even in a closed month; who / when are stamped
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.save_document('00000000-0000-0000-0000-0000000000a1', '{"doc_no":"ACK-1","status":"reviewed","doc_date":"2026-05-10","net":100}', '[{"line_no":1,"amount":100}]');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.month_locks (month) values ('2026-05');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ update public.documents set ack_flags = array['vat', 'words'] where id = '00000000-0000-0000-0000-0000000000a1' $$, 'staff mark warnings as fine, even in a closed month');
select is((select ack_by from public.documents where id = '00000000-0000-0000-0000-0000000000a1'), '00000000-0000-0000-0000-00000000000b'::uuid, 'who marked it is stamped');
select isnt((select ack_at from public.documents where id = '00000000-0000-0000-0000-0000000000a1'), null, 'and when');
select throws_like($$ update public.documents set net = 999 where id = '00000000-0000-0000-0000-0000000000a1' $$, 'month_locked%', 'the figures of a closed month still cannot change');
update public.documents set ack_flags = '{}' where id = '00000000-0000-0000-0000-0000000000a1';
select is((select ack_at from public.documents where id = '00000000-0000-0000-0000-0000000000a1'), null, 'undoing clears who / when');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
delete from public.month_locks where month = '2026-05';

-- Sales: members add one line per day and channel; closed months are frozen; only admins delete
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.sales (sale_date, channel, gross, vat) values ('2026-06-10', 'store', 10700, 700) $$, 'staff add a day of sales');
select throws_ok($$ insert into public.sales (sale_date, channel, gross, vat) values ('2026-06-10', 'store', 1, 0) $$, '23505', NULL, 'one line per day and channel');
select throws_ok($$ insert into public.sales (sale_date, channel, gross, vat) values ('2026-06-11', 'store', 100, 200) $$, '23514', NULL, 'VAT cannot exceed the sales');
delete from public.sales where sale_date = '2026-06-10';
select is((select count(*)::int from public.sales where sale_date = '2026-06-10'), 1, 'staff cannot delete sales');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.month_locks (month) values ('2026-06');
select throws_like($$ update public.sales set gross = 20000 where sale_date = '2026-06-10' $$, 'month_locked%', 'a closed month''s sales cannot change');
select throws_like($$ insert into public.sales (sale_date, channel, gross) values ('2026-06-12', 'grab', 500) $$, 'month_locked%', 'nor be added to');
delete from public.month_locks where month = '2026-06';
select lives_ok($$ delete from public.sales where sale_date = '2026-06-10' $$, 'an admin deletes sales of an open month');

-- Delivery-app commission rates: company-wide, only admins change them
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
create temp table fees_before as select app_fees from public.company_settings where id = 1;
update public.company_settings set app_fees = '{"grab": 99}' where id = 1;
select is((select app_fees from public.company_settings where id = 1), (select app_fees from fees_before), 'staff cannot change the app commission rates');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select throws_ok($$ update public.company_settings set app_fees = '[30]' where id = 1 $$, '23514', NULL, 'rates are kept per channel (an object)');

-- Phone notifications: each member keeps only their own devices
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ insert into public.push_subscriptions (endpoint, p256dh, auth) values ('https://push.example/staff', 'k', 'a') $$, 'a member turns on notifications for a device');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select is((select count(*)::int from public.push_subscriptions where endpoint = 'https://push.example/staff'), 0, 'nobody else sees that device, not even an admin');
select throws_ok($$ insert into public.push_subscriptions (user_id, endpoint, p256dh, auth) values ('00000000-0000-0000-0000-00000000000b', 'https://push.example/x', 'k', 'a') $$, '42501', NULL, 'nobody adds a device for someone else');

-- Branches: admins keep the list; books belong to a branch, the head office by default
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ insert into public.branches (no, name) values ('00009', 'nope') $$, '42501', NULL, 'staff cannot add a branch');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.branches (id, no, name, color) values ('00000000-0000-0000-0000-0000000000b1', '09991', 'Test branch', '');
select is((select count(*)::int from public.branches where no = '09991'), 1, 'an admin adds a branch');
select is((select branch_id from public.documents where id = '00000000-0000-0000-0000-0000000000a1'), public.head_branch(), 'a document saved without a branch is in the head office');
select lives_ok($$ insert into public.sales (branch_id, sale_date, channel, gross, vat) values ('00000000-0000-0000-0000-0000000000b1', '2026-06-20', 'store', 107, 7) $$, 'a day of sales for the branch');
select lives_ok($$ insert into public.sales (sale_date, channel, gross, vat) values ('2026-06-20', 'store', 214, 14) $$, 'the same day and channel in the head office is another line');
select throws_ok($$ insert into public.sales (sale_date, channel, gross, vat) values ('2026-06-20', 'store', 1, 0) $$, '23505', NULL, 'but only one per branch, day and channel');
delete from public.sales where sale_date = '2026-06-20';
select throws_like($$ delete from public.branches where no = '00000' $$, 'head office%', 'the head office cannot be removed');
update public.documents set branch_id = '00000000-0000-0000-0000-0000000000b1' where id = '00000000-0000-0000-0000-0000000000a1';
select throws_ok($$ delete from public.branches where no = '09991' $$, '23503', NULL, 'a branch with documents cannot be removed');

-- Branch colour: admins pick from the palette only
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ update public.branches set color = 'teal' where no = '00000' $$, 'an admin sets a branch colour');
select throws_ok($$ update public.branches set color = '#ff0000' where no = '00000' $$, '23514', NULL, 'only palette colours');

-- A mixed receipt keeps each line's category; equipment keeps its depreciation period
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.save_document('00000000-0000-0000-0000-0000000000c1', '{"doc_no":"MIX-1","status":"reviewed","doc_date":"2026-09-10","net":100,"category":"asset","dep_years":5}', '[{"line_no":1,"amount":60,"category":"office"},{"line_no":2,"amount":40}]');
select is((select array_agg(category order by line_no) from public.document_items where document_id = '00000000-0000-0000-0000-0000000000c1'), array['office', ''], 'each line keeps its own category ("" = the document''s)');
select is((select dep_years from public.documents where id = '00000000-0000-0000-0000-0000000000c1'), 5, 'the depreciation period is kept');

-- The remark (비고): written on a closed month's document too
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.month_locks (month) values ('2026-05');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ update public.documents set memo = 'checked with the owner' where id = '00000000-0000-0000-0000-0000000000a1' $$, 'a remark can be written on a closed month''s document');
select is((select memo from public.documents where id = '00000000-0000-0000-0000-0000000000a1'), 'checked with the owner', 'and it is kept');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
delete from public.month_locks where month = '2026-05';

-- Equipment disposal: allowed on a closed month's purchase, never into or out of a closed month
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.save_document('00000000-0000-0000-0000-0000000000d1', '{"doc_no":"OVEN-1","status":"reviewed","doc_date":"2026-04-10","net":64200,"category":"asset","dep_years":5}', '[]');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.month_locks (month) values ('2026-04'), ('2026-05');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select lives_ok($$ update public.documents set disposed_on = '2026-07-15' where id = '00000000-0000-0000-0000-0000000000d1' $$, 'equipment bought in a closed month can be marked disposed of in an open month');
select throws_like($$ update public.documents set disposed_on = '2026-05-20' where id = '00000000-0000-0000-0000-0000000000d1' $$, 'month_locked%', 'but not into a closed month');
select throws_like($$ update public.documents set dep_years = 3 where id = '00000000-0000-0000-0000-0000000000d1' $$, 'month_locked%', 'its depreciation period stays as filed');
select throws_ok($$ update public.documents set disposed_on = '2026-03-01' where id = '00000000-0000-0000-0000-0000000000d1' $$, '23514', NULL, 'not before it was bought');
select lives_ok($$ update public.documents set disposed_on = null where id = '00000000-0000-0000-0000-0000000000d1' $$, 'an open-month disposal can be undone');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
delete from public.month_locks where month in ('2026-04', '2026-05');

-- Photo fingerprints: kept with the document, only in their own format
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select public.save_document('00000000-0000-0000-0000-0000000000e1', '{"doc_no":"HASH-1","status":"reviewed","doc_date":"2026-09-10","net":10,"photo_hash":"0f0f0f0f0f0f0f0f"}', '[]');
select is((select photo_hash from public.documents where id = '00000000-0000-0000-0000-0000000000e1'), '0f0f0f0f0f0f0f0f', 'a photo fingerprint is kept with the document');
select throws_ok($$ update public.documents set photo_hash = 'not-a-hash' where id = '00000000-0000-0000-0000-0000000000e1' $$, '23514', NULL, 'fingerprints have one format');

-- Categories: admins keep the list; built-in ones and used ones are never deleted
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.categories where builtin), 13, 'members see the 13 built-in categories');
select throws_ok($$ insert into public.categories (key, name) values ('c_staff1', '{"ko":"x"}') $$, '42501', NULL, 'staff cannot add a category');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.categories (key, name, builtin) values ('c_pack01', '{"ko":"포장재","th":"บรรจุภัณฑ์","en":"Packaging","ja":"包装材"}', true) $$, 'an admin adds a category');
select is((select builtin from public.categories where key = 'c_pack01'), false, 'a new category is never built-in');
select throws_like($$ delete from public.categories where key = 'food' $$, 'category_builtin%', 'a built-in category cannot be deleted');
update public.categories set hidden = true where key = 'other';
select is((select hidden from public.categories where key = 'other'), false, '"other" always stays visible');
select public.save_document('00000000-0000-0000-0000-0000000000f1', '{"doc_no":"CAT-1","status":"reviewed","doc_date":"2026-09-10","net":10,"category":"c_pack01"}', '[]');
select throws_like($$ delete from public.categories where key = 'c_pack01' $$, 'category_in_use%', 'a category in use cannot be deleted');
select throws_ok($$ insert into public.categories (key) values ('C-BAD') $$, '23514', NULL, 'keys have one format');

-- Labour costs: one line per branch and month, admins only, frozen in a closed month
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select throws_ok($$ insert into public.labor_costs (month, wages) values ('2026-09', 100) $$, '42501', NULL, 'staff cannot enter labour costs');
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
select lives_ok($$ insert into public.labor_costs (month, wages, social_security) values ('2026-09', 90000, 3750) $$, 'an admin enters a month of labour costs');
select throws_ok($$ insert into public.labor_costs (month, wages) values ('2026-09', 1) $$, '23505', NULL, 'one line per branch and month');
insert into public.month_locks (month) values ('2026-09');
select throws_like($$ update public.labor_costs set wages = 1 where month = '2026-09' $$, 'month_locked%', 'a closed month''s labour costs cannot change');
delete from public.month_locks where month = '2026-09';
select is((select array_agg(key order by key) from public.categories where food_cost), array['food', 'supplies'], 'food cost starts with food and supplies');
select is((select builtin from public.categories where key = 'fees'), true, 'the fees category is built in');

-- Payroll: admins only (salaries and ID numbers), one line per employee, month and period, frozen in a closed month
select pg_temp.act_as('00000000-0000-0000-0000-00000000000a');
insert into public.employees (id, name, pay_type, rate, national_id) values ('00000000-0000-0000-0000-0000000000e9', 'Somchai', 'monthly', 18000, '1101700230705');
select lives_ok($$ insert into public.payroll_lines (employee_id, branch_id, month, period, gross, net) values ('00000000-0000-0000-0000-0000000000e9', public.head_branch(), '2026-08', 1, 9000, 9000) $$, 'an admin pays the first half of the month');
select throws_ok($$ insert into public.payroll_lines (employee_id, branch_id, month, period) values ('00000000-0000-0000-0000-0000000000e9', public.head_branch(), '2026-08', 1) $$, '23505', NULL, 'one line per employee, month and period');
select throws_ok($$ insert into public.employees (name, national_id) values ('x', '123') $$, '23514', NULL, 'an ID number has 13 digits');
insert into public.month_locks (month) values ('2026-08');
select throws_like($$ update public.payroll_lines set gross = 1 where month = '2026-08' $$, 'month_locked%', 'a closed month''s payroll cannot change');
delete from public.month_locks where month = '2026-08';
select pg_temp.act_as('00000000-0000-0000-0000-00000000000b');
select is((select count(*)::int from public.employees), 0, 'staff see no employees (salaries, ID numbers)');
select is((select count(*)::int from public.payroll_lines), 0, 'nor any payroll');
select throws_ok($$ insert into public.employees (name) values ('x') $$, '42501', NULL, 'nor add employees');

-- A signed-in person who is not a member sees nothing
select pg_temp.act_as('00000000-0000-0000-0000-00000000000c');
select throws_ok($$ select public.line_link_code() $$, 'members only', 'non-members get no link code');
select is((select count(*)::int from public.documents), 0, 'non-members see no documents');

select * from finish();
rollback;
