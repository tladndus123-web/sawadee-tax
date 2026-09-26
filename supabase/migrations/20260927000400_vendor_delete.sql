-- Vendors can be removed from the directory (admins only). Documents keep the seller exactly as read; only
-- their link to the directory entry is cleared. A later document from the same tax ID registers it again.

create policy "vendors remove" on public.vendors for delete using (public.is_admin());

alter table public.documents drop constraint documents_vendor_id_fkey;
alter table public.documents
  add constraint documents_vendor_id_fkey foreign key (vendor_id) references public.vendors (id) on delete set null;

-- Clearing that link is not a change to the document: allowed in a closed month …
create or replace function public.documents_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  free constant text[] := array['paid', 'paid_date', 'stickers', 'vendor_id', 'updated_at', 'updated_by'];
  was_locked boolean := false;
  now_locked boolean := new.status = 'reviewed' and public.month_locked(public.claim_month(new.tax_month, new.doc_date));
begin
  if tg_op = 'UPDATE' then
    was_locked := old.status = 'reviewed' and public.month_locked(public.claim_month(old.tax_month, old.doc_date));
  end if;
  if tg_op = 'INSERT' and now_locked then
    raise exception 'month_locked: % is closed', public.claim_month(new.tax_month, new.doc_date);
  end if;
  if tg_op = 'UPDATE' and (was_locked or now_locked) and (to_jsonb(new) - free) is distinct from (to_jsonb(old) - free) then
    raise exception 'month_locked: % is closed',
      case when was_locked then public.claim_month(old.tax_month, old.doc_date) else public.claim_month(new.tax_month, new.doc_date) end;
  end if;
  return new;
end $$;

-- … and not written to the documents' history either
create or replace function public.documents_log() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  act text;
  quiet constant text[] := array['vendor_id', 'updated_at', 'updated_by'];
begin
  if tg_op = 'UPDATE' and (to_jsonb(new) - quiet) = (to_jsonb(old) - quiet) then
    return null;
  end if;
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
