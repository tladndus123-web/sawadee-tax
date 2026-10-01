-- Pay handed out (owner's request 2026-10-01): each half of the month (1st–15th paid on the 15th, 16th–end at the
-- end) can be ticked "paid" by an admin — who and when are stamped here. Ticking is allowed in a closed month too
-- (only the tick changes, never the figures), and it does not undo the office check of the pay.

alter table public.payroll_lines
  add column if not exists paid_at timestamptz,
  add column if not exists paid_by uuid references auth.users (id) on delete set null;
comment on column public.payroll_lines.paid_at is 'When this half-month''s pay was ticked as handed out (null = not yet)';

create or replace function public.payroll_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- Only the paid tick changes: fine, even in a closed month
  if tg_op = 'UPDATE'
     and (to_jsonb(new) - 'paid_at' - 'paid_by' - 'updated_at') = (to_jsonb(old) - 'paid_at' - 'paid_by' - 'updated_at') then
    if new.paid_at is distinct from old.paid_at then
      new.paid_by := case when new.paid_at is null then null else coalesce(auth.uid(), new.paid_by) end;
    end if;
    new.updated_at := now();
    return new;
  end if;
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

-- Different figures after the check → the check is gone (the paid tick is not a figure)
create or replace function public.payroll_check_clear() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE'
     or (to_jsonb(new) - 'updated_at' - 'paid_on' - 'paid_at' - 'paid_by') is distinct from (to_jsonb(old) - 'updated_at' - 'paid_on' - 'paid_at' - 'paid_by') then
    delete from public.payroll_checks where employee_id = old.employee_id and month = old.month;
  end if;
  return null;
end $$;
