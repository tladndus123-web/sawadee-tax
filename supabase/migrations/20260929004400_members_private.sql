-- Staff no longer read the member list (owner, 2026-11-08: "직원에게서 직원 목록 숨기기"): a staff member reads only their
-- own row (role, LINE link …) while active; admins and owners read everyone as before. Screens that show "who checked / deleted"
-- get names through member_names(): every active member's name, and the email only for admins.

drop policy "members read" on public.members;
create policy "members read" on public.members for select using (public.is_admin() or (user_id = auth.uid() and public.is_member()));

create or replace function public.member_names()
  returns table (user_id uuid, name text, email text)
  language sql stable security definer set search_path = public as $$
  select m.user_id,
         coalesce(nullif(trim(m.name), ''), split_part(m.email, '@', 1)),
         case when public.is_admin() then m.email else null end
  from public.members m
  where public.is_member()
$$;
revoke all on function public.member_names() from public, anon;
grant execute on function public.member_names() to authenticated;
