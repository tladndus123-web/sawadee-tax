-- Save a document and its item lines in one transaction (insert or update).
-- security invoker: runs as the signed-in user, so every RLS policy and trigger still applies.
-- Only the keys present in p_row are written: missing keys keep their defaults (insert) or their
-- current values (update). Who/when and delete columns are never writable here — the triggers own them.
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
    'paid_date', 'confidence', 'unclear', 'note', 'flags', 'stickers', 'field_boxes', 'photo_path', 'ai_raw'];
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

grant execute on function public.save_document(uuid, jsonb, jsonb) to authenticated;
