-- Admins type PINs too (owner's decision 2026-10-06, on the screen only — the database still shows admins every
-- branch): a branch's own PIN to enter that branch, and a separate "all branches" PIN to see them together.
-- Wrong tries count with the staff ones (five in 10 minutes → wait). Admins can always set a new PIN in settings.

create table public.all_branches_pin (
  id         smallint primary key default 1 check (id = 1),
  pin_hash   text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.all_branches_pin enable row level security;

-- Shared by the checks below: too many wrong tries lately?
create or replace function public.pin_tries_left_check() returns void
  language plpgsql security definer set search_path = public as $$
begin
  if (select count(*) from public.branch_unlock_tries where user_id = auth.uid() and at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_tries';
  end if;
end $$;

-- Is this the branch's PIN? (no PIN on the branch → true). Opens nothing on the database side.
create or replace function public.check_branch_pin(p_branch uuid, p_pin text) returns boolean
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  if not public.is_member() then
    raise exception 'members only';
  end if;
  select pin_hash into v_hash from public.branch_pins where branch_id = p_branch;
  if v_hash is null then
    return true;
  end if;
  perform public.pin_tries_left_check();
  if coalesce(p_pin, '') = '' or crypt(p_pin, v_hash) <> v_hash then
    insert into public.branch_unlock_tries (user_id) values (auth.uid());
    return false;
  end if;
  delete from public.branch_unlock_tries where user_id = auth.uid();
  return true;
end $$;

-- Admins: is this the "all branches" PIN? (none set → true)
create or replace function public.check_all_branches_pin(p_pin text) returns boolean
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  select pin_hash into v_hash from public.all_branches_pin where id = 1;
  if v_hash is null then
    return true;
  end if;
  perform public.pin_tries_left_check();
  if coalesce(p_pin, '') = '' or crypt(p_pin, v_hash) <> v_hash then
    insert into public.branch_unlock_tries (user_id) values (auth.uid());
    return false;
  end if;
  delete from public.branch_unlock_tries where user_id = auth.uid();
  return true;
end $$;

-- Admins set, change or remove ("") the "all branches" PIN
create or replace function public.set_all_branches_pin(p_pin text) returns void
  language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
    raise exception 'admin_only';
  end if;
  if coalesce(p_pin, '') = '' then
    delete from public.all_branches_pin where id = 1;
    return;
  end if;
  if p_pin !~ '^\d{4,8}$' then
    raise exception 'bad_pin';
  end if;
  insert into public.all_branches_pin (id, pin_hash, updated_by, updated_at)
  values (1, crypt(p_pin, gen_salt('bf')), auth.uid(), now())
  on conflict (id) do update set pin_hash = excluded.pin_hash, updated_by = excluded.updated_by, updated_at = now();
end $$;

-- Is there an "all branches" PIN? (members; no hash)
create or replace function public.has_all_branches_pin() returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_member() and exists (select 1 from public.all_branches_pin);
$$;

revoke execute on function public.pin_tries_left_check() from public, anon, authenticated;
revoke execute on function public.check_branch_pin(uuid, text), public.check_all_branches_pin(text), public.set_all_branches_pin(text), public.has_all_branches_pin() from anon;
comment on table public.all_branches_pin is 'The admins'' "all branches" PIN (bcrypt); read only by its functions';
