-- The office checks each employee's pay for the month (owner's request 2026-09-29): one check per employee and month,
-- stamped by the database with who and when. Only a saved month can be checked. If the amounts change afterwards
-- (a new save with different figures), the check goes away so nobody trusts a check of other numbers. Checking is
-- allowed on a closed month (it changes nothing in the books). Admins only, like the rest of payroll.

create table public.payroll_checks (
  employee_id uuid not null references public.employees (id) on delete cascade,
  month       text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  checked_at  timestamptz not null default now(),
  checked_by  uuid references auth.users (id) on delete set null,
  primary key (employee_id, month)
);
alter table public.payroll_checks enable row level security;
create policy "payroll checks admin" on public.payroll_checks for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.payroll_check_stamp() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.payroll_lines where employee_id = new.employee_id and month = new.month) then
    raise exception 'payroll_not_saved: % has no saved pay for %', new.employee_id, new.month;
  end if;
  new.checked_at := now();
  new.checked_by := auth.uid();
  return new;
end $$;
create trigger payroll_check_stamp before insert or update on public.payroll_checks for each row execute function public.payroll_check_stamp();

-- Different figures after the check → the check is gone
create or replace function public.payroll_check_clear() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' or (to_jsonb(new) - 'updated_at' - 'paid_on') is distinct from (to_jsonb(old) - 'updated_at' - 'paid_on') then
    delete from public.payroll_checks where employee_id = old.employee_id and month = old.month;
  end if;
  return null;
end $$;
create trigger payroll_check_clear after update or delete on public.payroll_lines for each row execute function public.payroll_check_clear();
