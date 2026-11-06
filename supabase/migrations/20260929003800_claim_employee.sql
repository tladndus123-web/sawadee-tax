-- Expense claims paid back with the pay (owner, 2026-11-06: "급여로 돌려줄 경비를 급여에 자동으로"): an admin who
-- pays a claim "with the pay" picks the employee whose pay it goes with; the pay run then shows it as its own line
-- ("경비 돌려주기", not part of wages: no tax, no social security, not labour cost) added to the month-end payment.
-- Claimers are app members and employees are not, so the link is set by hand when paying. Adds a column only.

alter table public.expense_claims add column employee_id uuid references public.employees (id) on delete set null;
comment on column public.expense_claims.employee_id is 'Paid back with this employee''s pay (paid_how = payroll); null = not with the pay';
create index expense_claims_employee on public.expense_claims (employee_id, paid_on) where employee_id is not null;

-- Only an admin links a claim to an employee; it is kept only while the claim is paid with the pay
create or replace function public.expense_claims_employee_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is not null and not public.is_admin() then
    if tg_op = 'INSERT' then
      new.employee_id := null;
    elsif new.employee_id is distinct from old.employee_id then
      raise exception 'expense_claims_guard: only an admin decides a claim';
    end if;
  end if;
  if new.status <> 'paid' or new.paid_how is distinct from 'payroll' then
    new.employee_id := null;
  end if;
  return new;
end $$;
-- Named to run after expense_claims_guard (triggers fire in name order), which may clear paid_how
create trigger expense_claims_guard_employee before insert or update on public.expense_claims
  for each row execute function public.expense_claims_employee_guard();
revoke all on function public.expense_claims_employee_guard() from public, anon, authenticated;
