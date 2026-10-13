-- Employees on LINE (owner, 2026-10-13): an admin gets a one-time code for an employee, the employee sends it to the
-- bot, and from then on their payslip can be sent to them on LINE. Employees are not members: the link only lets
-- the app push to them — the bot still saves nothing for them. Like members, a LINE account is linked only by the
-- bot (employee_line_link); an admin may only clear it.

alter table public.employees add column line_user_id text unique;
comment on column public.employees.line_user_id is 'LINE user linked through the bot, for payslips; null = not linked';

create or replace function public.employees_line_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.line_user_id is distinct from old.line_user_id and new.line_user_id is not null and auth.uid() is not null then
    raise exception 'LINE accounts are linked through the bot';
  end if;
  return new;
end $$;
create trigger employees_line_guard before update of line_user_id on public.employees
  for each row execute function public.employees_line_guard();

-- One live code per employee, 10 minutes. No policies: only the functions below touch this table.
create table public.employee_link_codes (
  code        text primary key,
  employee_id uuid not null unique references public.employees (id) on delete cascade,
  expires_at  timestamptz not null
);
alter table public.employee_link_codes enable row level security;

-- Admin: a fresh 6-digit code for an employee (replaces any earlier one)
create or replace function public.employee_line_code(p_employee uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  if not exists (select 1 from public.employees where id = p_employee) then
    raise exception 'no_employee';
  end if;
  delete from public.employee_link_codes where expires_at < now();
  loop
    v := lpad(floor(random() * 1000000)::int::text, 6, '0');
    -- Never the same digits as a member's live code: the bot tries both tables
    if exists (select 1 from public.line_link_codes where code = v and expires_at > now()) then
      continue;
    end if;
    begin
      insert into public.employee_link_codes (code, employee_id, expires_at)
      values (v, p_employee, now() + interval '10 minutes')
      on conflict (employee_id) do update set code = excluded.code, expires_at = excluded.expires_at;
      return v;
    exception when unique_violation then
      -- another employee holds this code right now: draw again
    end;
  end loop;
end $$;
revoke execute on function public.employee_line_code(uuid) from public, anon;
grant execute on function public.employee_line_code(uuid) to authenticated;

-- Bot (service role): use a code; returns the employee it linked, or null when the code is wrong or old.
-- A LINE account belongs to one employee, so it is moved off anyone who had it before.
create or replace function public.employee_line_link(p_code text, p_line_user text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.employee_link_codes where code = p_code and expires_at > now() returning employee_id into v;
  if v is null then
    return null;
  end if;
  update public.employees set line_user_id = null where line_user_id = p_line_user and id <> v;
  update public.employees set line_user_id = p_line_user where id = v;
  return v;
end $$;
revoke execute on function public.employee_line_link(text, text) from public, anon, authenticated;
grant execute on function public.employee_line_link(text, text) to service_role;
