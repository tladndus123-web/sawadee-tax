-- Payroll the Thai way (owner's decisions 2026-09-28): employees (monthly or daily pay), paid twice a month (1–15 and
-- 16–end), overtime at the legal multiples, social security (สปส.) and withholding tax (ภ.ง.ด.1) worked out by the app
-- and adjustable per employee; payslips and the monthly filing lists. Salaries and ID numbers are sensitive:
-- only admins can see or change anything here. A closed month is frozen.

create table public.employees (
  id               uuid primary key default gen_random_uuid(),
  branch_id        uuid not null default public.head_branch() references public.branches (id) on delete restrict,
  name             text not null check (length(trim(name)) between 1 and 120),
  nickname         text not null default '' check (length(nickname) <= 40),
  position         text not null default '' check (length(position) <= 60),
  pay_type         text not null default 'monthly' check (pay_type in ('monthly', 'daily')),
  rate             numeric(12, 2) not null default 0 check (rate >= 0),     -- monthly salary, or pay per day
  start_date       date,
  end_date         date,
  ss_enrolled      boolean not null default true,                          -- ประกันสังคม มาตรา 33
  national_id      text not null default '' check (national_id ~ '^(\d{13})?$'),
  address          text not null default '' check (length(address) <= 300),
  extra_allowance  numeric(12, 2) not null default 0 check (extra_allowance >= 0),  -- other yearly tax allowances (spouse, children, insurance …)
  wht_fixed        numeric(12, 2) check (wht_fixed is null or wht_fixed >= 0),       -- a monthly tax amount set by hand instead of the app's
  note             text not null default '' check (length(note) <= 300),
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now()
);
alter table public.employees enable row level security;
create policy "employees admin" on public.employees for all using (public.is_admin()) with check (public.is_admin());

-- One line per employee, month and pay period (1 = 1st–15th, 2 = 16th–end). The amounts the app worked out are kept
-- as they were paid, so a payslip never changes afterwards.
create table public.payroll_lines (
  id              uuid primary key default gen_random_uuid(),
  employee_id     uuid not null references public.employees (id) on delete restrict,
  branch_id       uuid not null references public.branches (id) on delete restrict,
  month           text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  period          smallint not null check (period in (1, 2)),
  pay_type        text not null default 'monthly' check (pay_type in ('monthly', 'daily')),  -- as paid (a later raise
  rate            numeric(12, 2) not null default 0 check (rate >= 0),                      -- leaves old payslips alone)
  days_worked     numeric(5, 2) not null default 0 check (days_worked >= 0),
  absent_days     numeric(5, 2) not null default 0 check (absent_days >= 0),
  ot_hours        numeric(6, 2) not null default 0 check (ot_hours >= 0),
  holiday_hours   numeric(6, 2) not null default 0 check (holiday_hours >= 0),
  holiday_ot_hours numeric(6, 2) not null default 0 check (holiday_ot_hours >= 0),
  bonus           numeric(12, 2) not null default 0 check (bonus >= 0),
  allowance       numeric(12, 2) not null default 0 check (allowance >= 0),
  other_deduction numeric(12, 2) not null default 0 check (other_deduction >= 0),
  gross           numeric(12, 2) not null default 0,
  ss_employee     numeric(12, 2) not null default 0,
  ss_employer     numeric(12, 2) not null default 0,
  wht             numeric(12, 2) not null default 0,
  net             numeric(12, 2) not null default 0,
  paid_on         date,
  updated_at      timestamptz not null default now(),
  unique (employee_id, month, period)
);
alter table public.payroll_lines enable row level security;
create policy "payroll admin" on public.payroll_lines for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.payroll_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and public.month_locked(old.month) then
    raise exception 'month_locked: % is closed', old.month;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if public.month_locked(new.month) then
    raise exception 'month_locked: % is closed', new.month;
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger payroll_guard before insert or update or delete on public.payroll_lines for each row execute function public.payroll_guard();

-- Social security rules as they change (2026: 5 %, wages 1,650–17,500 → at most 875 a month each side)
alter table public.company_settings
  add column payroll_settings jsonb not null default '{"ssRate": 5, "ssFloor": 1650, "ssCeiling": 17500}' check (jsonb_typeof(payroll_settings) = 'object');
