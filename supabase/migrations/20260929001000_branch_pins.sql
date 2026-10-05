-- Branch passwords (owner's decision 2026-10-06): a branch can have a PIN (4–8 digits). Staff choose a branch after
-- signing in and type its PIN; the database then lets them see and change that branch's books for 12 hours (the
-- length of a sign-in). Choosing another branch closes the previous one. Admins see every branch without a PIN.
-- A branch without a PIN stays open to every member, as before. Five wrong PINs in 10 minutes → wait.
-- Real security: every branch table (documents and their items / events, sales, labour, fixed costs, stock) and the
-- photos are filtered by can_see_branch() for staff.

-- PIN hashes: nobody reads them (no policies); only the functions below use them
create table public.branch_pins (
  branch_id  uuid primary key references public.branches (id) on delete cascade,
  pin_hash   text not null,
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now()
);
alter table public.branch_pins enable row level security;

-- The branch a staff member opened, until when (one at a time)
create table public.branch_unlocks (
  user_id     uuid primary key references auth.users (id) on delete cascade,
  branch_id   uuid not null references public.branches (id) on delete cascade,
  unlocked_at timestamptz not null default now(),
  expires_at  timestamptz not null
);
alter table public.branch_unlocks enable row level security;
create policy "own unlock" on public.branch_unlocks for select using (user_id = auth.uid());

-- Wrong PINs, for the wait after five
create table public.branch_unlock_tries (
  user_id uuid not null references auth.users (id) on delete cascade,
  at      timestamptz not null default now()
);
create index branch_unlock_tries_user on public.branch_unlock_tries (user_id, at);
alter table public.branch_unlock_tries enable row level security;

-- May the signed-in member see this branch's books?
create or replace function public.can_see_branch(b uuid) returns boolean
  language sql stable security definer set search_path = public as $$
  select public.is_admin()
      or (public.is_member() and (
            not exists (select 1 from public.branch_pins p where p.branch_id = b)
            or exists (select 1 from public.branch_unlocks u where u.user_id = auth.uid() and u.branch_id = b and u.expires_at > now())));
$$;

-- Which branches have a PIN (for the lock icons; no hashes)
create or replace function public.branches_with_pin() returns setof uuid
  language sql stable security definer set search_path = public as $$
  select branch_id from public.branch_pins where public.is_member();
$$;

-- Open a branch: true when opened, false for a wrong PIN; admins need no PIN
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

-- Close the branch I opened (signing out, or before choosing again)
create or replace function public.lock_branch() returns void
  language sql security definer set search_path = public as $$
  delete from public.branch_unlocks where user_id = auth.uid();
$$;

-- Admins set, change or remove (empty) a branch's PIN; whoever had it open must type the new one
create or replace function public.set_branch_pin(p_branch uuid, p_pin text) returns void
  language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_admin() then
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

-- The LINE bot (service role) acting for a member: the branches that member may use right now
create or replace function public.member_branches(p_user uuid) returns setof uuid
  language sql stable security definer set search_path = public as $$
  select b.id from public.branches b
  where exists (
    select 1 from public.members m
    where m.user_id = p_user and m.disabled_at is null
      and (m.role = 'admin'
           or not exists (select 1 from public.branch_pins p where p.branch_id = b.id)
           or exists (select 1 from public.branch_unlocks u where u.user_id = p_user and u.branch_id = b.id and u.expires_at > now())));
$$;

revoke execute on function public.unlock_branch(uuid, text), public.lock_branch(), public.set_branch_pin(uuid, text), public.branches_with_pin(), public.can_see_branch(uuid) from anon;
revoke execute on function public.member_branches(uuid) from public, anon, authenticated;
grant execute on function public.member_branches(uuid) to service_role;

-- Every branch table: staff only see (and write) the branches they may see
drop policy "documents read" on public.documents;
drop policy "documents add" on public.documents;
drop policy "documents edit" on public.documents;
create policy "documents read" on public.documents for select
  using (public.is_member() and (deleted_at is null or public.is_admin()) and public.can_see_branch(branch_id));
create policy "documents add" on public.documents for insert
  with check (public.is_member() and deleted_at is null and public.can_see_branch(branch_id));
create policy "documents edit" on public.documents for update
  using (public.is_member() and (deleted_at is null or public.is_admin()) and public.can_see_branch(branch_id))
  with check (public.is_member() and public.can_see_branch(branch_id));

-- (document_items already follow the documents they belong to)
drop policy "events read" on public.document_events;
create policy "events read" on public.document_events for select
  using (public.is_member() and (public.is_admin() or exists (select 1 from public.documents d where d.id = document_id)));

drop policy "sales read" on public.sales;
drop policy "sales add" on public.sales;
drop policy "sales change" on public.sales;
create policy "sales read" on public.sales for select using (public.is_member() and public.can_see_branch(branch_id));
create policy "sales add" on public.sales for insert with check (public.is_member() and public.can_see_branch(branch_id));
create policy "sales change" on public.sales for update
  using (public.is_member() and public.can_see_branch(branch_id))
  with check (public.is_member() and public.can_see_branch(branch_id));

drop policy "labor read" on public.labor_costs;
create policy "labor read" on public.labor_costs for select using (public.is_member() and public.can_see_branch(branch_id));
drop policy "fixed read" on public.fixed_costs;
create policy "fixed read" on public.fixed_costs for select using (public.is_member() and public.can_see_branch(branch_id));
drop policy "stock read" on public.stock_counts;
create policy "stock read" on public.stock_counts for select using (public.is_member() and public.can_see_branch(branch_id));

-- Photos: a document's files sit under "<document id>/…", a day of sales names its file in sales.photo_path
drop policy "photos read" on storage.objects;
create policy "photos read" on storage.objects for select using (
  bucket_id = 'documents' and public.is_member() and (
    public.is_admin()
    or exists (select 1 from public.documents d where d.id::text = split_part(name, '/', 1))
    or exists (select 1 from public.sales s where s.photo_path = name)
    or name like 'sample/%'
  )
);

comment on table public.branch_pins is 'Branch PIN hashes (bcrypt); read only by the branch functions';
comment on table public.branch_unlocks is 'The branch each staff member opened with its PIN, for 12 hours';
