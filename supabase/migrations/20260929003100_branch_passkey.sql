-- Open a branch with quick sign-in (passkey: Face ID / fingerprint / Windows Hello) instead of its PIN (owner,
-- 2026-11-04). The app signs in again with the passkey right before; the fresh access token then carries that
-- sign-in in its `amr` claim. This app signs people in only by email (otp / magic link) or by passkey, so a sign-in
-- from the last 3 minutes that is not an email one is the passkey. The PIN keeps working as before.
-- A staff member kept out of the branch (member_branch_blocks) gets "failed" here too, counted like a wrong PIN.
-- Adds two functions; no data changes.

-- The current token comes from a passkey sign-in made in the last 3 minutes
create or replace function public.passkey_fresh() returns boolean
  language sql stable security definer set search_path = public as $$
  select coalesce((
    select bool_or(
             coalesce(a->>'method', '') not in ('', 'otp', 'magiclink', 'password', 'email/signup', 'invite', 'recovery',
                                                 'email_change', 'anonymous', 'token_refresh')
             and (a->>'timestamp') ~ '^[0-9]+$'
             and (a->>'timestamp')::bigint >= extract(epoch from now())::bigint - 180)
    from jsonb_array_elements(case when jsonb_typeof(auth.jwt()->'amr') = 'array' then auth.jwt()->'amr' else '[]'::jsonb end) a
  ), false);
$$;
revoke all on function public.passkey_fresh() from public, anon;
grant execute on function public.passkey_fresh() to authenticated;

-- Staff: open a branch for this sign-in after a fresh passkey sign-in (like unlock_branch with the right PIN)
create or replace function public.unlock_branch_passkey(p_branch uuid) returns boolean
  language plpgsql security definer set search_path = public as $$
begin
  if not public.is_member() then
    raise exception 'members only';
  end if;
  if not exists (select 1 from public.branches where id = p_branch) then
    raise exception 'no_branch';
  end if;
  if public.is_admin() then
    return public.passkey_fresh();
  end if;
  if (select count(*) from public.branch_unlock_tries where user_id = auth.uid() and at > now() - interval '10 minutes') >= 5 then
    raise exception 'too_many_tries';
  end if;
  if public.branch_blocked(auth.uid(), p_branch) or not public.passkey_fresh() then
    insert into public.branch_unlock_tries (user_id) values (auth.uid());
    return false;
  end if;
  delete from public.branch_unlock_tries where user_id = auth.uid();
  insert into public.branch_unlocks (user_id, branch_id, unlocked_at, expires_at)
  values (auth.uid(), p_branch, now(), now() + interval '12 hours')
  on conflict (user_id) do update set branch_id = excluded.branch_id, unlocked_at = excluded.unlocked_at, expires_at = excluded.expires_at;
  return true;
end $$;
revoke all on function public.unlock_branch_passkey(uuid) from public, anon;
grant execute on function public.unlock_branch_passkey(uuid) to authenticated;
