-- The accountant's Excel layout for the purchase ledger (owner, 2026-10-27; lib/excel-format.ts): which columns, in
-- which order, under which headings. Adds a column only; nothing is changed or removed. Admins change it like the
-- other company settings (existing policy on company_settings).
alter table public.company_settings add column if not exists excel_format jsonb;
