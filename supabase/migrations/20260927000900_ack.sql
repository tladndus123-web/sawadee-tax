-- "문제 없음" (owner's request 2026-09-27): a person looked at a document's automatic-check warnings and accepts them.
-- ack_flags keeps exactly which warnings were accepted, so a warning that appears later (after an edit) shows again.
-- Who / when are stamped by the database. It changes no figures, so it is allowed in a closed month too.

alter table public.documents
  add column ack_flags text[] not null default '{}',
  add column ack_by    uuid references auth.users (id) on delete set null,
  add column ack_at    timestamptz;

create or replace function public.documents_ack_stamp() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.ack_flags is distinct from old.ack_flags then
    if cardinality(new.ack_flags) = 0 then
      new.ack_by := null;
      new.ack_at := null;
    else
      new.ack_by := coalesce(auth.uid(), new.ack_by);
      new.ack_at := now();
    end if;
  else
    new.ack_by := old.ack_by;
    new.ack_at := old.ack_at;
  end if;
  return new;
end $$;

-- "documents_ack_stamp" sorts before "documents_month_lock": the stamp is in place before the lock compares rows
create trigger documents_ack_stamp before update on public.documents
  for each row execute function public.documents_ack_stamp();

-- Closed months: accepting warnings is not a change to the books
create or replace function public.documents_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  free constant text[] := array['paid', 'paid_date', 'stickers', 'vendor_id', 'ack_flags', 'ack_by', 'ack_at', 'updated_at', 'updated_by'];
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
