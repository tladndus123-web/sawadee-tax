-- Branches (สาขา) of the one company (owner's request 2026-09-28: 6 shops, one tax ID, different names).
-- Every document and every day of sales belongs to one branch; books, VAT and P&L are kept per branch.
-- The head office (สาขาที่ 00000) is created here and everything that exists goes into it.

create table public.branches (
  id         uuid primary key default gen_random_uuid(),
  no         text not null unique check (no ~ '^[0-9]{5}$'),   -- "00000" head office, "00001"… as on tax invoices
  name       text not null default '',
  sort       int  not null default 0,
  created_at timestamptz not null default now()
);
alter table public.branches enable row level security;
create policy "branches read"  on public.branches for select using (public.is_member());
create policy "branches admin" on public.branches for all using (public.is_admin()) with check (public.is_admin());

insert into public.branches (id, no, name, sort) values ('00000000-0000-0000-0000-000000000000', '00000', '', 0);

/** The head office: where a document or sale goes when nothing says otherwise */
create or replace function public.head_branch() returns uuid
  language sql stable security definer set search_path = public as $$
  select id from public.branches where no = '00000' limit 1
$$;

-- The head office stays; a branch with books cannot be removed (its documents / sales would be orphaned)
create or replace function public.branches_guard() returns trigger
  language plpgsql as $$
begin
  if old.no = '00000' then
    raise exception 'head office cannot be removed';
  end if;
  return old;
end $$;
create trigger branches_guard before delete on public.branches for each row execute function public.branches_guard();

alter table public.documents add column branch_id uuid not null default public.head_branch() references public.branches (id) on delete restrict;
alter table public.sales     add column branch_id uuid not null default public.head_branch() references public.branches (id) on delete restrict;
create index documents_branch_idx on public.documents (branch_id);

-- One line per branch, day and channel (was: per day and channel)
alter table public.sales drop constraint sales_sale_date_channel_key;
alter table public.sales add constraint sales_branch_date_channel_key unique (branch_id, sale_date, channel);

-- save_document: branch_id is writable too (same function as before otherwise)
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
    'tax_month', 'no_claim', 'wht_rate', 'wht_type', 'branch_id'];
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
