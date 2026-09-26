-- Tax details a real filing needs:
--  tax_month  "YYYY-MM": the tax month the input VAT is claimed in (a late-received invoice goes into a later,
--             still open month). NULL = the invoice's own month. Reports, month groups and month close use it.
--  no_claim   the input VAT may not be claimed although the invoice is valid (§82/5: entertainment, passenger
--             cars …). NULL = decided by the category (entertainment → not claimable).
--  wht_rate   withholding tax rate in % (0 = none), wht_type the kind of income (service, rent, …) for the
--             50 ทวิ certificate and the ภ.ง.ด.3 / ภ.ง.ด.53 lists.

alter table public.documents
  add column tax_month text check (tax_month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  add column no_claim  boolean,
  add column wht_rate  numeric(5, 2) not null default 0 check (wht_rate >= 0 and wht_rate <= 100),
  add column wht_type  text not null default '';

-- The month a saved document is reported in
create or replace function public.claim_month(tax_month text, doc_date date) returns text
  language sql immutable as $$
  select coalesce(tax_month, to_char(doc_date, 'YYYY-MM'))
$$;

create or replace function public.month_locked(m text) returns boolean
  language sql stable security definer set search_path = public as $$
  select m is not null and exists (select 1 from public.month_locks where month = m)
$$;

-- Month close now follows the claim month
create or replace function public.documents_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  free constant text[] := array['paid', 'paid_date', 'stickers', 'updated_at', 'updated_by'];
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

create or replace function public.document_items_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  d record;
begin
  select status, tax_month, doc_date into d from public.documents where id = coalesce(new.document_id, old.document_id);
  if d.status = 'reviewed' and public.month_locked(public.claim_month(d.tax_month, d.doc_date)) then
    raise exception 'month_locked: % is closed', public.claim_month(d.tax_month, d.doc_date);
  end if;
  return coalesce(new, old);
end $$;

drop function public.month_locked(date);

-- save_document: the new columns are writable too (same function as before otherwise)
create or replace function public.save_document(p_id uuid, p_row jsonb, p_items jsonb)
  returns uuid
  language plpgsql security invoker set search_path = public as $$
declare
  v_id uuid := coalesce(p_id, gen_random_uuid());
  v_cols text;
  v_writable constant text[] := array[
    'status', 'doc_type', 'doc_title', 'copy_kind', 'form_serial', 'doc_no', 'doc_date', 'date_was_buddhist',
    'vendor_id', 'seller', 'customer', 'order_no', 'term', 'credit_days', 'due_date', 'sales', 'delivery',
    'total', 'discount', 'after_disc', 'deposit', 'after_dep', 'exempt', 'taxable', 'vat', 'net', 'wht',
    'words_printed', 'words', 'terms', 'signs', 'form_code', 'form_since', 'category', 'payment', 'paid',
    'paid_date', 'confidence', 'unclear', 'note', 'flags', 'stickers', 'field_boxes', 'photo_path', 'ai_raw',
    'tax_month', 'no_claim', 'wht_rate', 'wht_type'];
begin
  select string_agg(quote_ident(k), ', ') into v_cols
  from jsonb_object_keys(coalesce(p_row, '{}')) as k
  where k = any (v_writable) and not (k = 'photo_path' and p_row -> k = 'null'::jsonb);

  if exists (select 1 from public.documents where id = v_id) then
    if v_cols is not null then
      execute format(
        'update public.documents d set (%1$s) = (select %1$s from jsonb_populate_record(null::public.documents, $2)) where d.id = $1',
        v_cols) using v_id, p_row;
    end if;
    if not exists (select 1 from public.documents where id = v_id) then
      raise exception 'document % cannot be edited', v_id;
    end if;
  else
    execute format(
      'insert into public.documents (id%1$s) select $1%2$s from jsonb_populate_record(null::public.documents, $2)',
      coalesce(', ' || v_cols, ''), coalesce(', ' || v_cols, '')) using v_id, p_row;
  end if;

  delete from public.document_items where document_id = v_id;
  insert into public.document_items (document_id, line_no, code, "desc", wh, qty, unit, price, amount)
  select v_id, (i ->> 'line_no')::int, coalesce(i ->> 'code', ''), coalesce(i -> 'desc', '{}'), coalesce(i ->> 'wh', ''),
         coalesce((i ->> 'qty')::numeric, 0), coalesce(i -> 'unit', '{}'), coalesce((i ->> 'price')::numeric, 0),
         coalesce((i ->> 'amount')::numeric, 0)
  from jsonb_array_elements(coalesce(p_items, '[]')) as i;
  return v_id;
end $$;
