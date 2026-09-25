-- LINE bot (1:1 chat). A member links their LINE account by sending the bot a one-time code from
-- Settings; each photo they send is read by AI and saved straight to the ledger as that member
-- (so stamps, the audit trail and the vendor dictionary work exactly as for an app upload).

alter table public.members add column line_user_id text unique;

-- Members may unlink themselves, but a LINE account is only ever linked by the bot (line_link below)
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
  -- Never leave the company without an admin
  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.members where role = 'admin' and user_id <> old.user_id) then
    raise exception 'at least one admin is required';
  end if;
  return new;
end $$;

-- One live code per member, 10 minutes. No policies: only the functions below touch this table.
create table public.line_link_codes (
  code       text primary key,
  user_id    uuid not null unique references public.members (user_id) on delete cascade,
  expires_at timestamptz not null
);
alter table public.line_link_codes enable row level security;

-- Signed-in member: a fresh 6-digit code (replaces any earlier one)
create or replace function public.line_link_code() returns text
  language plpgsql security definer set search_path = public as $$
declare v text;
begin
  if not public.is_member() then
    raise exception 'members only';
  end if;
  delete from public.line_link_codes where expires_at < now();
  loop
    v := lpad(floor(random() * 1000000)::int::text, 6, '0');
    begin
      insert into public.line_link_codes (code, user_id, expires_at)
      values (v, auth.uid(), now() + interval '10 minutes')
      on conflict (user_id) do update set code = excluded.code, expires_at = excluded.expires_at;
      return v;
    exception when unique_violation then
      -- someone else holds this code right now: draw again
    end;
  end loop;
end $$;
revoke execute on function public.line_link_code() from public, anon;
grant execute on function public.line_link_code() to authenticated;

-- Bot (service role): use a code; returns the member it linked, or null when the code is wrong or old.
-- A LINE account belongs to one member, so it is moved off anyone who had it before.
create or replace function public.line_link(p_code text, p_line_user text) returns uuid
  language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  -- Act as the system, never as whoever the request claims to be (the members guard allows only the system)
  perform set_config('request.jwt.claim.sub', '', true);
  perform set_config('request.jwt.claims', '', true);
  delete from public.line_link_codes where code = p_code and expires_at > now() returning user_id into v;
  if v is null then
    return null;
  end if;
  update public.members set line_user_id = null where line_user_id = p_line_user and user_id <> v;
  update public.members set line_user_id = p_line_user where user_id = v;
  return v;
end $$;
revoke execute on function public.line_link(text, text) from public, anon, authenticated;
grant execute on function public.line_link(text, text) to service_role;

-- LINE may deliver the same message twice: the first claim wins, later ones are skipped
create table public.line_messages (
  message_id  text primary key,
  user_id     uuid references public.members (user_id) on delete set null,
  document_id uuid references public.documents (id),
  at          timestamptz not null default now()
);
alter table public.line_messages enable row level security;

-- Bot (service role): save a document as the member who sent it. auth.uid() is set to that member for
-- this transaction only, so save_document, the stamps, the audit trail and the vendor trigger all see them.
create or replace function public.line_save_document(p_user uuid, p_message text, p_id uuid, p_row jsonb, p_items jsonb)
  returns uuid
  language plpgsql security definer set search_path = public as $$
declare v uuid;
begin
  if not exists (select 1 from public.members where user_id = p_user) then
    raise exception 'not a member';
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  v := public.save_document(p_id, p_row, p_items);
  update public.line_messages set document_id = v where message_id = p_message;
  return v;
end $$;
revoke execute on function public.line_save_document(uuid, text, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.line_save_document(uuid, text, uuid, jsonb, jsonb) to service_role;
