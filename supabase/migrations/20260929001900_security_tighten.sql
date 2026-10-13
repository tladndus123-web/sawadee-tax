-- Security tidy-up (owner, 2026-10-13), from the Supabase security advisor:
-- 1. Functions that run with the owner's rights (security definer) are no longer callable by visitors who are not
--    signed in. Their own checks already refused them; now the door is shut too. Kept open: the five yes/no helpers
--    the table rules (RLS) call, which answer "no" to a visitor anyway.
-- 2. Trigger functions (they run when a row is saved) cannot be called as an API function by anyone. Triggers still
--    fire: PostgreSQL checks EXECUTE only when the trigger is created.
-- 3. The four functions without a fixed search path get one.

alter function public.tri_has(jsonb) set search_path = public;
alter function public.claim_month(text, date) set search_path = public;
alter function public.branches_guard() set search_path = public;
alter function public.categories_insert() set search_path = public;

do $$
declare
  f record;
  keep_open constant text[] := array['is_member', 'is_admin', 'can_see_branch', 'head_branch', 'month_locked'];
begin
  for f in
    select p.oid, p.oid::regprocedure as sig, p.proname, p.prorettype = 'trigger'::regtype as is_trigger
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.prosecdef
  loop
    if f.is_trigger then
      execute format('revoke execute on function %s from public, anon, authenticated', f.sig);
    elsif not (f.proname = any (keep_open)) then
      -- Signed-in members keep exactly the access they had (revoking PUBLIC could take it away)
      if has_function_privilege('authenticated', f.oid, 'execute') then
        execute format('revoke execute on function %s from public, anon', f.sig);
        execute format('grant execute on function %s to authenticated', f.sig);
      else
        execute format('revoke execute on function %s from public, anon', f.sig);
      end if;
    end if;
  end loop;
end $$;

-- Functions made later get no visitor access by default
alter default privileges in schema public revoke execute on functions from anon;
