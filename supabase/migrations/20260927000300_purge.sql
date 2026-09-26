-- Delete for good (owner's decision, 2026-09-26): only an admin, only a document already in the trash, never a
-- saved document of a closed (filed) tax month. The document, its item lines and its history go; a short record
-- of what was deleted, why and by whom stays in document_purges. The photos are removed by the app right after
-- (storage API), which only admins may do.

create table public.document_purges (
  id            bigint generated always as identity primary key,
  document_id   uuid not null,
  doc_no        text not null default '',
  seller        jsonb not null default '{}',
  doc_date      date,
  net           numeric(14, 2) not null default 0,
  vat           numeric(14, 2) not null default 0,
  status        text not null default '',
  delete_reason text,
  deleted_by    uuid references auth.users (id),
  deleted_at    timestamptz,
  purged_by     uuid references auth.users (id),
  purged_at     timestamptz not null default now()
);
alter table public.document_purges enable row level security;
create policy "purges read" on public.document_purges for select using (public.is_admin());
-- Rows come only from purge_document (security definer)

create or replace function public.purge_document(p_id uuid) returns text
  language plpgsql security definer set search_path = public as $$
declare
  d public.documents;
begin
  if not public.is_admin() then
    raise exception 'only admins can delete documents for good' using errcode = '42501';
  end if;
  select * into d from public.documents where id = p_id for update;
  if not found then
    raise exception 'document % not found', p_id;
  end if;
  if d.deleted_at is null then
    raise exception 'move the document to the trash first';
  end if;
  if d.status = 'reviewed' and public.month_locked(public.claim_month(d.tax_month, d.doc_date)) then
    raise exception 'month_locked: % is closed', public.claim_month(d.tax_month, d.doc_date);
  end if;

  insert into public.document_purges (document_id, doc_no, seller, doc_date, net, vat, status, delete_reason, deleted_by, deleted_at, purged_by)
  values (d.id, d.doc_no, d.seller, d.doc_date, d.net, d.vat, d.status, d.delete_reason, d.deleted_by, d.deleted_at, auth.uid());
  -- A LINE message that created it keeps its row (so the bot never saves it twice), without the link
  update public.line_messages set document_id = null where document_id = p_id;
  delete from public.document_items where document_id = p_id;
  delete from public.documents where id = p_id;
  return d.photo_path;
end $$;

revoke execute on function public.purge_document(uuid) from public, anon;
grant execute on function public.purge_document(uuid) to authenticated;

-- Admins may remove photos (of a document deleted for good)
create policy "photos remove" on storage.objects for delete using (bucket_id = 'documents' and public.is_admin());
