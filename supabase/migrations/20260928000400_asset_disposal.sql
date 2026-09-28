-- Equipment sold or thrown away (owner's request 2026-09-28): the date it went. Depreciation stops and what was
-- not yet written off becomes a cost of that month (lib/cost-split.ts).
-- Marking it is allowed on a document of a closed month (the purchase itself does not change), but only when the
-- disposal month — before and after the change — is still open, so a filed month's figures never move.

alter table public.documents add column disposed_on date;
alter table public.documents add constraint documents_disposed_after_bought check (disposed_on is null or doc_date is null or disposed_on >= doc_date);

create or replace function public.documents_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  free constant text[] := array['paid', 'paid_date', 'stickers', 'vendor_id', 'ack_flags', 'ack_by', 'ack_at', 'updated_at', 'updated_by', 'disposed_on'];
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
  -- The disposal date moves costs into its month: both the old and the new disposal month must be open
  if tg_op = 'UPDATE' and new.disposed_on is distinct from old.disposed_on then
    if old.disposed_on is not null and public.month_locked(to_char(old.disposed_on, 'YYYY-MM')) then
      raise exception 'month_locked: % is closed', to_char(old.disposed_on, 'YYYY-MM');
    end if;
    if new.disposed_on is not null and public.month_locked(to_char(new.disposed_on, 'YYYY-MM')) then
      raise exception 'month_locked: % is closed', to_char(new.disposed_on, 'YYYY-MM');
    end if;
  end if;
  return new;
end $$;
