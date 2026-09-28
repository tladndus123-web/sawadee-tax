-- Duplicate photos (owner's request 2026-09-28): a fingerprint of each document's photo (lib/photo-hash.ts, 16 hex),
-- so the same photo is caught before the AI reads it again or it reaches the ledger twice. Only a fingerprint of the
-- picture, never the figures: it may be filled in on a closed month's document too (the one-off backfill).

alter table public.documents add column photo_hash text check (photo_hash is null or photo_hash ~ '^[0-9a-f]{16}$');

-- save_document: photo_hash writable (same function as before otherwise)
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
    'tax_month', 'no_claim', 'wht_rate', 'wht_type', 'branch_id', 'dep_years', 'photo_hash'];
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
  insert into public.document_items (document_id, line_no, code, "desc", wh, qty, unit, price, amount, category)
  select v_id, (i ->> 'line_no')::int, coalesce(i ->> 'code', ''), coalesce(i -> 'desc', '{}'), coalesce(i ->> 'wh', ''),
         coalesce((i ->> 'qty')::numeric, 0), coalesce(i -> 'unit', '{}'), coalesce((i ->> 'price')::numeric, 0),
         coalesce((i ->> 'amount')::numeric, 0), coalesce(i ->> 'category', '')
  from jsonb_array_elements(coalesce(p_items, '[]')) as i;
  return v_id;
end $$;

grant execute on function public.save_document(uuid, jsonb, jsonb) to authenticated;

-- Month lock: the fingerprint is not part of the books (same function as before otherwise)
create or replace function public.documents_month_lock() returns trigger
  language plpgsql set search_path = public as $$
declare
  free constant text[] := array['paid', 'paid_date', 'stickers', 'vendor_id', 'ack_flags', 'ack_by', 'ack_at', 'updated_at', 'updated_by', 'disposed_on', 'photo_hash'];
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
