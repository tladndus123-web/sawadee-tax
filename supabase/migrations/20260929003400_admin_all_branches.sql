-- Owners can also keep an admin from "all branches together" (owner, 2026-11-05: "전체 지점은 보지 못하게도 설정").
-- members.all_branches = false: that admin picks one branch at a time (the screen; each branch's data is still
-- theirs to see unless kept out). And each person can ask which branches they are kept out of, so the app leaves
-- those out of every list and total and shows them only as locked when choosing a branch.
-- Adds a column (default: as before) and a function; the owner guard learns the new column.

alter table public.members add column all_branches boolean not null default true;

-- The branches I am kept out of (owners: none)
create or replace function public.my_blocked_branches() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select branch_id from public.member_branch_blocks where user_id = auth.uid() and public.branch_blocked(auth.uid(), branch_id);
$$;
revoke all on function public.my_blocked_branches() from public, anon;
grant execute on function public.my_blocked_branches() to authenticated;

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
    if new.owner or new.role = 'admin' or new.admin_screens is not null or not new.all_branches then
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
  if new.owner is distinct from old.owner or new.admin_screens is distinct from old.admin_screens
     or new.all_branches is distinct from old.all_branches then
    raise exception 'only owners can change this';
  end if;
  if (old.owner or old.role = 'admin' or new.role = 'admin')
     and (new.role is distinct from old.role or new.disabled_at is distinct from old.disabled_at) then
    raise exception 'only owners can change admins';
  end if;
  return new;
end $$;
