-- Access removal for people who leave. A removed member keeps their row (their name stays on the
-- documents and history they made) but is no longer a member for any rule: is_member() / is_admin()
-- ignore them, so RLS closes every table and the photo bucket at once. Only admins can remove or
-- restore access, never their own, and never the last active admin. The server also bans the login
-- (app/api/members) so the session cannot be refreshed.

alter table public.members
  add column disabled_at    timestamptz,
  add column disabled_by    uuid references auth.users (id),
  add column disable_reason text,
  add constraint member_disable_complete check (
    (disabled_at is null and disabled_by is null and disable_reason is null)
    or (disabled_at is not null and coalesce(length(btrim(disable_reason)), 0) >= 2)
  );

create or replace function public.is_member() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.members where user_id = auth.uid() and disabled_at is null) $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.members where user_id = auth.uid() and role = 'admin' and disabled_at is null) $$;

create or replace function public.members_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role / SQL console (bootstrap script, support, LINE bot)
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;
  if new.line_user_id is distinct from old.line_user_id and new.line_user_id is not null and auth.uid() is not null then
    raise exception 'LINE accounts are linked through the bot';
  end if;

  -- Removing / restoring access
  if new.disabled_at is distinct from old.disabled_at or new.disable_reason is distinct from old.disable_reason
     or new.disabled_by is distinct from old.disabled_by then
    if auth.uid() is not null and not public.is_admin() then
      raise exception 'only admins can change access';
    end if;
    if auth.uid() is not null and new.user_id = auth.uid() then
      raise exception 'you cannot remove your own access';
    end if;
    if new.disabled_at is not null then
      new.disabled_at := coalesce(old.disabled_at, now());
      new.disabled_by := coalesce(auth.uid(), new.disabled_by);
      new.line_user_id := null; -- the LINE bot stops answering them too
    else
      new.disabled_by := null;
      new.disable_reason := null;
    end if;
  end if;

  -- Never leave the company without an active admin
  if old.role = 'admin' and old.disabled_at is null and (new.role <> 'admin' or new.disabled_at is not null)
     and not exists (select 1 from public.members where role = 'admin' and disabled_at is null and user_id <> old.user_id) then
    raise exception 'at least one admin is required';
  end if;
  return new;
end $$;

-- The LINE bot saves only for active members
create or replace function public.line_save_document(p_user uuid, p_message text, p_id uuid, p_row jsonb, p_items jsonb)
  returns uuid
  language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not exists (select 1 from public.members where user_id = p_user and disabled_at is null) then
    raise exception 'not a member';
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  v := public.save_document(p_id, p_row, p_items);
  update public.line_messages set document_id = v where message_id = p_message;
  return v;
end $$;

-- A missing (null) delete reason used to pass the check (length(null) is null): require it for real
alter table public.documents drop constraint soft_delete_complete;
alter table public.documents add constraint soft_delete_complete check (
  (deleted_at is null and deleted_by is null and delete_reason is null)
  or (deleted_at is not null and deleted_by is not null and coalesce(length(btrim(delete_reason)), 0) >= 2)
);
