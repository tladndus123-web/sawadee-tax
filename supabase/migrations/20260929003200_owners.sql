-- Owners above admins (owner, 2026-11-04: "관리자 위 권한은 모두 볼 수 있고, 관리자는 관리자 위가 지정한 곳만").
-- An owner is an admin with `owner = true`: sees every branch, always. Only owners keep people (admins too) out of
-- branches (member_branch_blocks), choose which screens an admin sees (admin_screens), and make, change or remove
-- admins and owners. A kept-out admin sees that branch as locked (no password opens it) and none of its data: every
-- admin rule on a table with a branch now also asks admin_for(branch).
-- Adds two columns and widens functions and policies; existing rows only get owner = true for the four owners.

alter table public.members
  add column owner boolean not null default false,
  -- The screens this admin may open (null = all); set by owners. Shapes the menu and the pages (UI).
  add column admin_screens text[];

update public.members set owner = true
where role = 'admin' and lower(email) in ('w.yoshiko88@gmail.com', 'suhojayu4@gmail.com', 'kiichino1@gmail.com', 'suzun024k@gmail.com');

create or replace function public.is_owner() returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.members where user_id = auth.uid() and owner and role = 'admin' and disabled_at is null);
$$;
revoke all on function public.is_owner() from public, anon;
grant execute on function public.is_owner() to authenticated;

-- Kept out of a branch: anyone but an owner
create or replace function public.branch_blocked(p_user uuid, p_branch uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_branch_blocks k join public.members m on m.user_id = k.user_id
    where k.user_id = p_user and k.branch_id = p_branch and not m.owner
  );
$$;
revoke all on function public.branch_blocked(uuid, uuid) from public, anon, authenticated;

-- An admin who may act on this branch (null = no branch: any admin)
create or replace function public.admin_for(b uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_admin() and (b is null or not public.branch_blocked(auth.uid(), b));
$$;
create or replace function public.admin_for_employee(e uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_admin() and not exists (
    select 1 from public.employees x where x.id = e and x.branch_id is not null and public.branch_blocked(auth.uid(), x.branch_id));
$$;
-- (callable like is_admin(): policies run them for every caller)

create or replace function public.can_see_branch(b uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.admin_for(b)
      or (public.is_member() and not public.branch_blocked(auth.uid(), b) and (
            not exists (select 1 from public.branch_pins p where p.branch_id = b)
            or exists (select 1 from public.branch_unlocks u where u.user_id = auth.uid() and u.branch_id = b and u.expires_at > now())));
$$;

-- Only owners see or change who is kept out where
drop policy "branch blocks admin" on public.member_branch_blocks;
create policy "branch blocks owner" on public.member_branch_blocks for all using (public.is_owner()) with check (public.is_owner());

-- Every admin rule on a table with a branch: the admin must not be kept out of that branch
do $$
declare
  r record;
  col text;
  q text;
  c text;
begin
  for r in
    select p.tablename, p.policyname, p.qual, p.with_check
    from pg_policies p
    where p.schemaname = 'public' and (p.qual ~ 'is_admin\(\)' or p.with_check ~ 'is_admin\(\)')
      and p.tablename not in ('members', 'member_branch_blocks', 'branch_unlocks', 'branch_pins', 'document_events')
  loop
    col := case
      when r.tablename = 'branches' then 'public.admin_for(id)'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tablename and column_name = 'branch_id') then 'public.admin_for(branch_id)'
      when exists (select 1 from information_schema.columns where table_schema = 'public' and table_name = r.tablename and column_name = 'employee_id') then 'public.admin_for_employee(employee_id)'
      else null end;
    continue when col is null;
    q := regexp_replace(r.qual, '\mis_admin\(\)', col, 'g');
    c := regexp_replace(r.with_check, '\mis_admin\(\)', col, 'g');
    execute format('alter policy %I on public.%I', r.policyname, r.tablename)
      || coalesce(' using (' || q || ')', '') || coalesce(' with check (' || c || ')', '');
  end loop;
end $$;

-- A document's history: as far as its document can be seen
drop policy "events read" on public.document_events;
create policy "events read" on public.document_events for select
  using (public.is_member() and exists (select 1 from public.documents d where d.id = document_events.document_id));

create or replace function public.branches_with_pin() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select branch_id from public.branch_pins where public.is_member()
  union
  select branch_id from public.member_branch_blocks where user_id = auth.uid() and public.branch_blocked(auth.uid(), branch_id);
$$;

create or replace function public.unlock_branch(p_branch uuid, p_pin text) returns boolean
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  if not public.is_member() then
    raise exception 'members only';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'no_branch';
  end if;
  -- Kept out (admins too): it behaves like a wrong password, every time (counted like one)
  if public.branch_blocked(auth.uid(), p_branch) then
    if (select count(*) from public.branch_unlock_tries where user_id = auth.uid() and at > now() - interval '10 minutes') >= 5 then
      raise exception 'too_many_tries';
    end if;
    insert into public.branch_unlock_tries (user_id) values (auth.uid());
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;
  select pin_hash into v_hash from public.branch_pins where branch_id = p_branch;
  if v_hash is not null then
    if (select count(*) from public.branch_unlock_tries where user_id = auth.uid() and at > now() - interval '10 minutes') >= 5 then
      raise exception 'too_many_tries';
    end if;
    if coalesce(p_pin, '') = '' or crypt(p_pin, v_hash) <> v_hash then
      insert into public.branch_unlock_tries (user_id) values (auth.uid());
      return false;
    end if;
    delete from public.branch_unlock_tries where user_id = auth.uid();
  end if;
  insert into public.branch_unlocks (user_id, branch_id, unlocked_at, expires_at)
  values (auth.uid(), p_branch, now(), now() + interval '12 hours')
  on conflict (user_id) do update set branch_id = excluded.branch_id, unlocked_at = excluded.unlocked_at, expires_at = excluded.expires_at;
  return true;
end $$;

create or replace function public.unlock_branch_passkey(p_branch uuid) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then
    raise exception 'members only';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'no_branch';
  end if;
  if (select count(*) from public.branch_unlock_tries where user_id = auth.uid() and at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_tries';
  end if;
  if public.branch_blocked(auth.uid(), p_branch) or not public.passkey_fresh() then
    insert into public.branch_unlock_tries (user_id) values (auth.uid());
    return false;
  end if;
  if public.is_admin() then
    return true;
  end if;
  delete from public.branch_unlock_tries where user_id = auth.uid();
  insert into public.branch_unlocks (user_id, branch_id, unlocked_at, expires_at)
  values (auth.uid(), p_branch, now(), now() + interval '12 hours')
  on conflict (user_id) do update set branch_id = excluded.branch_id, unlocked_at = excluded.unlocked_at, expires_at = excluded.expires_at;
  return true;
end $$;

-- Admins' PIN check on the screen: a kept-out admin is always "wrong"
create or replace function public.check_branch_pin(p_branch uuid, p_pin text) returns boolean
  language plpgsql security definer set search_path = public, extensions as $$
declare
  v_hash text;
begin
  if not public.is_member() then
    raise exception 'members only';
  end if;
  if public.branch_blocked(auth.uid(), p_branch) then
    perform public.pin_tries_left_check();
    insert into public.branch_unlock_tries (user_id) values (auth.uid());
    return false;
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

-- A kept-out admin cannot change that branch's PIN
create or replace function public.set_branch_pin(p_branch uuid, p_pin text) returns void
  language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.admin_for(p_branch) then
    raise exception 'admin_only';
  end if;
  if coalesce(p_pin, '') = '' then
    delete from public.branch_pins where branch_id = p_branch;
    return;
  end if;
  if p_pin !~ '^\d{4,8}$' then
    raise exception 'bad_pin';
  end if;
  insert into public.branch_pins (branch_id, pin_hash, updated_by, updated_at)
  values (p_branch, crypt(p_pin, gen_salt('bf')), auth.uid(), now())
  on conflict (branch_id) do update set pin_hash = excluded.pin_hash, updated_by = excluded.updated_by, updated_at = now();
  delete from public.branch_unlocks where branch_id = p_branch;
end $$;

-- Only owners make, change or remove admins and owners, and set admins' screens (signed-in sessions; the service
-- role and SQL console, auth.uid() null, are the app's own server steps)
create or replace function public.members_owner_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if auth.uid() is null or public.is_owner() then
    if tg_op = 'UPDATE' and old.owner and (not new.owner or new.role <> 'admin' or new.disabled_at is not null)
       and not exists (select 1 from public.members where owner and role = 'admin' and disabled_at is null and user_id <> old.user_id) then
      raise exception 'at least one owner is required';
    end if;
    return case when tg_op = 'DELETE' then old else new end;
  end if;
  if tg_op = 'INSERT' then
    if new.owner or new.role = 'admin' or new.admin_screens is not null then
      raise exception 'only owners can make admins';
    end if;
    return new;
  end if;
  if tg_op = 'DELETE' then
    if old.owner or old.role = 'admin' then
      raise exception 'only owners can remove admins';
    end if;
    return old;
  end if;
  if new.owner is distinct from old.owner or new.admin_screens is distinct from old.admin_screens then
    raise exception 'only owners can change this';
  end if;
  if (old.owner or old.role = 'admin' or new.role = 'admin')
     and (new.role is distinct from old.role or new.disabled_at is distinct from old.disabled_at) then
    raise exception 'only owners can change admins';
  end if;
  return new;
end $$;
create trigger members_owner_guard before insert or update or delete on public.members
  for each row execute function public.members_owner_guard();
