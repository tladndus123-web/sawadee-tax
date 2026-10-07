-- Each member's usual branch (owner, 2026-10-08): after signing in it comes first in the branch list with its PIN
-- box already open. Only a convenience: it opens nothing by itself (the PIN still decides). Only admins set it.

alter table public.members
  add column home_branch uuid references public.branches (id) on delete set null;

create or replace function public.members_home_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role / SQL console
  if new.home_branch is distinct from old.home_branch and auth.uid() is not null and not public.is_admin() then
    raise exception 'only admins can set home branches';
  end if;
  return new;
end $$;

create trigger members_home_guard before update on public.members for each row execute function public.members_home_guard();
