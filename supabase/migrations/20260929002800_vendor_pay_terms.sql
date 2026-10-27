-- A supplier's payment terms (owner, 2026-10-27): set once, every new reading of their invoices gets its due date
-- from them when the paper prints none (lib/pay-terms.ts). Adds a column only; nothing is changed or removed.
alter table public.vendors add column if not exists pay_terms text
  check (pay_terms is null or pay_terms ~ '^(now|eom|days:([1-9][0-9]?|[1-2][0-9]{2}|3[0-5][0-9]|36[0-5])|next:([1-9]|[12][0-9]|3[01]))$');
