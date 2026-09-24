-- Step 5: Thai Receipt Ledger schema (PROMPT.md §5) + what later steps added:
-- drafts, colour stickers, typed signatures, soft delete with reason, and an audit trail.
-- One company per database. Every table is RLS-protected; the browser only ever uses the anon key.
--   staff : read, add, edit documents
--   admin : + soft delete / restore / trash, company settings, members
-- Nobody hard-deletes documents (no DELETE policy): deleting = deleted_at + deleted_by + delete_reason.

-- ── Members ────────────────────────────────────────────────────────────────
create table public.members (
  user_id    uuid primary key references auth.users (id) on delete cascade,
  email      text not null,
  name       text not null default '',
  role       text not null default 'staff' check (role in ('admin', 'staff')),
  created_at timestamptz not null default now()
);

create or replace function public.is_member() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.members where user_id = auth.uid()) $$;

create or replace function public.is_admin() returns boolean
  language sql stable security definer set search_path = public
  as $$ select exists (select 1 from public.members where user_id = auth.uid() and role = 'admin') $$;

alter table public.members enable row level security;
create policy "members read" on public.members for select using (public.is_member());
create policy "admins manage members" on public.members for all using (public.is_admin()) with check (public.is_admin());
-- Anyone may change their own display name (role changes stay admin-only via the trigger below)
create policy "own name" on public.members for update using (user_id = auth.uid()) with check (user_id = auth.uid());

create or replace function public.members_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role / SQL console (bootstrap script, support)
  if new.role is distinct from old.role and auth.uid() is not null and not public.is_admin() then
    raise exception 'only admins can change roles';
  end if;
  -- Never leave the company without an admin
  if old.role = 'admin' and new.role <> 'admin'
     and not exists (select 1 from public.members where role = 'admin' and user_id <> old.user_id) then
    raise exception 'at least one admin is required';
  end if;
  return new;
end $$;
create trigger members_guard before update on public.members for each row execute function public.members_guard();

-- ── Company settings (single row) ─────────────────────────────────────────
create table public.company_settings (
  id            int primary key default 1 check (id = 1),
  name          jsonb not null default '{"th":"","en":"","ja":""}',
  tax_id        text not null default '',
  branch        text not null default '',
  form_config   jsonb not null default '{}',
  sticker_names jsonb not null default '{}',
  updated_at    timestamptz not null default now(),
  updated_by    uuid references auth.users (id)
);
insert into public.company_settings (id) values (1);

alter table public.company_settings enable row level security;
create policy "settings read" on public.company_settings for select using (public.is_member());
create policy "settings admin" on public.company_settings for update using (public.is_admin()) with check (public.is_admin());

-- ── Vendors (filled in step 7) ────────────────────────────────────────────
create table public.vendors (
  id      uuid primary key default gen_random_uuid(),
  tax_id  text unique,
  name    jsonb not null default '{"th":"","en":"","ja":""}',
  address jsonb not null default '{"th":"","en":"","ja":""}',
  tel     text not null default '',
  fax     text not null default ''
);
alter table public.vendors enable row level security;
create policy "vendors read" on public.vendors for select using (public.is_member());
create policy "vendors write" on public.vendors for insert with check (public.is_member());
create policy "vendors update" on public.vendors for update using (public.is_member()) with check (public.is_member());

-- ── Documents ─────────────────────────────────────────────────────────────
create table public.documents (
  id                uuid primary key default gen_random_uuid(),
  created_by        uuid references auth.users (id),
  created_at        timestamptz not null default now(),
  updated_by        uuid references auth.users (id),
  updated_at        timestamptz not null default now(),
  status            text not null default 'draft' check (status in ('draft', 'reviewed')),
  doc_type          text not null default 'other',
  doc_title         jsonb not null default '{"th":"","en":"","ja":""}',
  copy_kind         text not null default 'unknown',
  form_serial       text not null default '',
  doc_no            text not null default '',
  doc_date          date,
  date_was_buddhist boolean not null default false,
  vendor_id         uuid references public.vendors (id),
  seller            jsonb not null default '{}',
  customer          jsonb not null default '{}',
  order_no          text not null default '',
  term              jsonb not null default '{"th":"","en":"","ja":""}',
  credit_days       int not null default 0,
  due_date          date,
  sales             jsonb not null default '{}',
  delivery          jsonb not null default '{}',
  total             numeric(14, 2) not null default 0,
  discount          numeric(14, 2) not null default 0,
  after_disc        numeric(14, 2) not null default 0,
  deposit           numeric(14, 2) not null default 0,
  after_dep         numeric(14, 2) not null default 0,
  exempt            numeric(14, 2) not null default 0,
  taxable           numeric(14, 2) not null default 0,
  vat               numeric(14, 2) not null default 0,
  net               numeric(14, 2) not null default 0,
  wht               numeric(14, 2) not null default 0,
  words_printed     text not null default '',
  words             jsonb not null default '{"th":"","en":"","ja":""}',
  terms             jsonb not null default '[]',
  signs             jsonb not null default '{}',
  form_code         text not null default '',
  form_since        text not null default '',
  category          text not null default 'other',
  payment           text not null default 'other',
  paid              boolean not null default false,
  paid_date         date,
  confidence        text not null default 'medium',
  unclear           text[] not null default '{}',
  note              jsonb not null default '{"th":"","en":"","ja":""}',
  flags             text[] not null default '{}',
  stickers          text[] not null default '{}',
  field_boxes       jsonb not null default '{}',
  photo_path        text,
  ai_raw            jsonb,
  deleted_at        timestamptz,
  deleted_by        uuid references auth.users (id),
  delete_reason     text,
  -- Soft delete always carries who and why
  constraint soft_delete_complete check (
    (deleted_at is null and deleted_by is null and delete_reason is null)
    or (deleted_at is not null and deleted_by is not null and length(btrim(delete_reason)) >= 2)
  )
);
create index documents_live_date on public.documents (doc_date desc) where deleted_at is null;
create index documents_dup on public.documents (doc_no, (seller ->> 'taxId'));

create table public.document_items (
  id          uuid primary key default gen_random_uuid(),
  document_id uuid not null references public.documents (id) on delete cascade,
  line_no     int not null,
  code        text not null default '',
  "desc"      jsonb not null default '{"th":"","en":"","ja":""}',
  wh          text not null default '',
  qty         numeric(18, 4) not null default 0,
  unit        jsonb not null default '{"th":"","en":"","ja":""}',
  price       numeric(14, 2) not null default 0,
  amount      numeric(14, 2) not null default 0,
  unique (document_id, line_no)
);

-- Who/when is stamped by the database, never trusted from the browser
create or replace function public.documents_stamp() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
    -- Deleting / restoring is an admin action, and only that action may touch the delete columns
    if (new.deleted_at is distinct from old.deleted_at or new.deleted_by is distinct from old.deleted_by
        or new.delete_reason is distinct from old.delete_reason) then
      if auth.uid() is not null and not public.is_admin() then
        raise exception 'only admins can delete or restore documents';
      end if;
      if new.deleted_at is not null then
        new.deleted_by := coalesce(auth.uid(), new.deleted_by);
        new.deleted_at := now();
      end if;
    elsif old.deleted_at is not null then
      raise exception 'restore the document before editing it';
    end if;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger documents_stamp before insert or update on public.documents for each row execute function public.documents_stamp();

alter table public.documents enable row level security;
create policy "documents read" on public.documents for select
  using (public.is_member() and (deleted_at is null or public.is_admin()));
create policy "documents add" on public.documents for insert with check (public.is_member() and deleted_at is null);
create policy "documents edit" on public.documents for update
  using (public.is_member() and (deleted_at is null or public.is_admin()))
  with check (public.is_member());
-- No delete policy: documents are never removed from the database

alter table public.document_items enable row level security;
create policy "items read" on public.document_items for select
  using (exists (select 1 from public.documents d where d.id = document_id));
create policy "items write" on public.document_items for all
  using (exists (select 1 from public.documents d where d.id = document_id and d.deleted_at is null))
  with check (exists (select 1 from public.documents d where d.id = document_id and d.deleted_at is null));

-- ── Audit trail: who uploaded, edited, deleted, restored (PROMPT: 기록) ─────────
create table public.document_events (
  id          bigint generated always as identity primary key,
  document_id uuid not null references public.documents (id) on delete cascade,
  user_id     uuid references auth.users (id),
  action      text not null check (action in ('create', 'update', 'delete', 'restore')),
  detail      jsonb not null default '{}',
  at          timestamptz not null default now()
);

create or replace function public.documents_log() returns trigger
  language plpgsql security definer set search_path = public as $$
declare act text;
begin
  if tg_op = 'INSERT' then act := 'create';
  elsif new.deleted_at is not null and old.deleted_at is null then act := 'delete';
  elsif new.deleted_at is null and old.deleted_at is not null then act := 'restore';
  else act := 'update';
  end if;
  insert into public.document_events (document_id, user_id, action, detail)
  values (new.id, auth.uid(), act,
          case when act = 'delete' then jsonb_build_object('reason', new.delete_reason)
               when act = 'update' and new.status is distinct from old.status then jsonb_build_object('status', new.status)
               else '{}'::jsonb end);
  return null;
end $$;
create trigger documents_log after insert or update on public.documents for each row execute function public.documents_log();

alter table public.document_events enable row level security;
create policy "events read" on public.document_events for select using (public.is_member());
-- Rows come only from the trigger (security definer); no insert/update/delete policies

-- ── Photo storage: private bucket, shown through signed URLs ────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('documents', 'documents', false, 5242880, array['image/jpeg', 'image/png', 'image/webp']);

create policy "photos read" on storage.objects for select using (bucket_id = 'documents' and public.is_member());
create policy "photos add" on storage.objects for insert with check (bucket_id = 'documents' and public.is_member());
