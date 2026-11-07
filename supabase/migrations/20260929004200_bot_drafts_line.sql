-- Grok Bot doing more of the work (owner, 2026-11-08: "일이나 보고 여러 일정을 줄이는"): a receipt it got (an emailed
-- e-tax invoice, a photo) goes into the ledger as a DRAFT for a person to check — never straight into the books — and
-- its summaries can go to the connecting owner's LINE, at most 10 a day per connection.

-- Save a document as the owner who made the connection (the same save_document rules as the app: drafts never count)
create or replace function public.bot_save_document(p_user uuid, p_id uuid, p_row jsonb, p_items jsonb)
  returns uuid
  language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from public.members where user_id = p_user and role = 'admin' and owner and disabled_at is null) then
    raise exception 'not an owner';
  end if;
  if coalesce(p_row ->> 'status', '') <> 'draft' then
    raise exception 'agents save drafts only';
  end if;
  perform set_config('request.jwt.claim.sub', p_user::text, true);
  perform set_config('request.jwt.claims', json_build_object('sub', p_user, 'role', 'authenticated')::text, true);
  return public.save_document(p_id, p_row, p_items);
end $$;
revoke all on function public.bot_save_document(uuid, uuid, jsonb, jsonb) from public, anon, authenticated;
grant execute on function public.bot_save_document(uuid, uuid, jsonb, jsonb) to service_role;

-- LINE messages an agent sent (the daily limit)
create table public.bot_line_sends (
  id      bigserial primary key,
  key_id  uuid not null references public.bot_keys (id) on delete cascade,
  sent_at timestamptz not null default now()
);
create index bot_line_sends_key on public.bot_line_sends (key_id, sent_at desc);
alter table public.bot_line_sends enable row level security;
revoke all on public.bot_line_sends from anon, authenticated;
revoke all on sequence public.bot_line_sends_id_seq from anon, authenticated;
