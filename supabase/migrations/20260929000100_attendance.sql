-- Attendance and leave, and employee document expiry (owner's decisions 2026-09-29): admins mark each employee's
-- days on a calendar (worked / day off / unpaid absence / annual leave / sick leave, with overtime hours); the pay
-- run reads its inputs from here. Leave balances (6 days annual after a year, 30 days paid sick — Thai Labour
-- Protection Act) come from the same rows. Documents that expire (work permit, visa, health certificate …) live on the
-- employee with their dates, for reminders. Admins only, like everything about employees; a closed month is frozen.

create table public.attendance (
  id          uuid primary key default gen_random_uuid(),
  employee_id uuid not null references public.employees (id) on delete cascade,
  day         date not null,
  kind        text not null check (kind in ('work', 'off', 'absent', 'annual', 'sick')),
  ot_hours    numeric(4, 2) not null default 0 check (ot_hours >= 0 and ot_hours <= 24),
  note        text not null default '' check (length(note) <= 100),
  updated_at  timestamptz not null default now(),
  unique (employee_id, day)
);
alter table public.attendance enable row level security;
create policy "attendance admin" on public.attendance for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.attendance_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and public.month_locked(to_char(old.day, 'YYYY-MM')) then
    raise exception 'month_locked: % is closed', to_char(old.day, 'YYYY-MM');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if public.month_locked(to_char(new.day, 'YYYY-MM')) then
    raise exception 'month_locked: % is closed', to_char(new.day, 'YYYY-MM');
  end if;
  new.updated_at := now();
  return new;
end $$;
create trigger attendance_guard before insert or update or delete on public.attendance for each row execute function public.attendance_guard();

-- Documents with an expiry date: [{"name": "Work permit", "expires": "2027-03-31"}, …]
alter table public.employees
  add column documents jsonb not null default '[]' check (jsonb_typeof(documents) = 'array');
