-- Branch passwords go away (owner, 2026-11-04: "지점별 패스워드 기능 완전히 없애자 — 이제 지점 권한을 지정할 수 있으니까.
-- 전체 지점만 남겨"). Who sees which branch is now set per person (member_branch_blocks). The "all branches" password
-- for admins stays (all_branches_pin). A kept-out person still gets the locked-branch prompt that never opens.
-- Staff management is for owners only ("직원관리는 대표자만"): only owners change members' rows.
-- Removes the branch PINs (settings, not books); the PIN function stays for owners only, without a screen.

delete from public.branch_pins;

create or replace function public.set_branch_pin(p_branch uuid, p_pin text) returns void
  language plpgsql security definer set search_path = public, extensions as $$
begin
  if not public.is_owner() then
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

-- Members' rows: owners manage them (everyone keeps editing their own name / LINE link through "own name")
drop policy "admins manage members" on public.members;
create policy "owners manage members" on public.members for all using (public.is_owner()) with check (public.is_owner());
