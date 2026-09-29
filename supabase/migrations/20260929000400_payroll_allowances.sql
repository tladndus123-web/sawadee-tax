-- Named allowances on each pay line (owner's request 2026-09-29): [{ key, name, amount }], picked from a list or typed.
-- `allowance` stays the line's total (what pay, tax and social security use); this only says what it is made of, for
-- the pay run and the payslip. Lines saved before stay [] (their total shows as "other"). A new save with other names
-- clears the office check (payroll_check_clear compares the whole line).
alter table public.payroll_lines
  add column allowances jsonb not null default '[]' check (jsonb_typeof(allowances) = 'array');
comment on column public.payroll_lines.allowances is 'Named allowances of the line [{key, name, amount}] (key from the app''s list, or "" with a typed name); allowance is their total';
