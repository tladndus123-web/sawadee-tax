-- One staff member kept out of one branch (owner, 2026-11-04: "이 직원만 YUNA 1 못 보게 — 누르면 비밀번호 창이 뜨지만
-- 그건 그냥 보여 주기"). Admins tick it in staff management. For that person the branch looks locked: it is listed
-- among the branches with a password (even when it has none), and no password opens it — the database answers
-- "wrong" like for any wrong PIN. Its documents, sales and everything else behind can_see_branch() stay out of reach.
-- Only admins can see or change who is kept out where. Adds a table and widens four functions; no data changes.

create table public.member_branch_blocks (
  user_id uuid not null references public.members (user_id) on delete cascade,
  branch_id uuid not null references public.branches (id) on delete cascade,
  created_at timestamptz not null default now(),
  created_by uuid default auth.uid(),
  primary key (user_id, branch_id)
);
alter table public.member_branch_blocks enable row level security;
create policy "branch blocks admin" on public.member_branch_blocks for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.member_branch_blocks from anon;

-- Is this person kept out of this branch? (admins never are)
create or replace function public.branch_blocked(p_user uuid, p_branch uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from public.member_branch_blocks k join public.members m on m.user_id = k.user_id
    where k.user_id = p_user and k.branch_id = p_branch and m.role <> 'admin'
  );
$$;
revoke all on function public.branch_blocked(uuid, uuid) from public, anon, authenticated;

create or replace function public.can_see_branch(b uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.is_member() and not public.branch_blocked(auth.uid(), b) and (
            not exists (select 1 from public.branch_pins p where p.branch_id = b)
            or exists (select 1 from public.branch_unlocks u where u.user_id = auth.uid() and u.branch_id = b and u.expires_at > now())));
$$;

create or replace function public.member_branches(p_user uuid) returns setof uuid
  language sql stable security definer set search_path = public as $$
  select b.id from public.branches b
  where not public.branch_blocked(p_user, b.id)
    and exists (
      select 1 from public.members m
      where m.user_id = p_user and m.disabled_at is null
        and (m.role = 'admin'
             or not exists (select 1 from public.branch_pins p where p.branch_id = b.id)
             or exists (select 1 from public.branch_unlocks u where u.user_id = p_user and u.branch_id = b.id and u.expires_at > now())));
$$;

-- The branches that ask for a password — for a person kept out of a branch, that branch too (it looks locked)
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
  if public.is_admin() then
    return true;
  end if;
  -- Kept out: it behaves like a wrong password, every time (counted like one)
  if public.branch_blocked(auth.uid(), p_branch) then
    if (select count(*) from public.branch_unlock_tries where user_id = auth.uid() and at > now() - interval '10 minutes') >= 5 then
      raise exception 'too_many_tries';
    end if;
    insert into public.branch_unlock_tries (user_id) values (auth.uid());
    return false;
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
