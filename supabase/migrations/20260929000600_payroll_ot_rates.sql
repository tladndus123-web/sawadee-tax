-- Overtime multiples set by the company (owner's request 2026-09-29): each pay line keeps the ones it was paid with, so
-- a payslip never changes when the settings do. Never below the Labour Protection Act: overtime ×1.5, holiday work ×1
-- (monthly staff) / ×2 (daily staff), holiday overtime ×3. holiday_rate null = the legal one for the line's pay type
-- (lines saved before, and a save from an app version that does not send it yet).
alter table public.payroll_lines
  add column ot_rate numeric(5, 2) not null default 1.5 check (ot_rate between 1.5 and 10),
  add column holiday_rate numeric(5, 2) check (holiday_rate is null or holiday_rate between (case when pay_type = 'monthly' then 1 else 2 end) and 10),
  add column holiday_ot_rate numeric(5, 2) not null default 3 check (holiday_ot_rate between 3 and 10);
comment on column public.payroll_lines.ot_rate is 'Overtime multiple the line was paid with (at least 1.5)';
comment on column public.payroll_lines.holiday_rate is 'Holiday-work multiple the line was paid with (at least 1 monthly / 2 daily; null = that legal one)';
comment on column public.payroll_lines.holiday_ot_rate is 'Holiday-overtime multiple the line was paid with (at least 3)';
