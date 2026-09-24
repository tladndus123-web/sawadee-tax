-- Step 7: vendor dictionary, filled automatically from saved documents.
-- A vendor is keyed by the seller's 13-digit tax ID. The first document creates it; later documents
-- only fill what the dictionary is still missing — the dictionary is the source of truth once set
-- (members can correct it on the Vendors page), and the app uses it to tidy new AI readings.

alter table public.vendors
  add column branch     jsonb not null default '{"th":"","en":"","ja":""}',
  add column updated_at timestamptz not null default now();

-- "Is any language filled in?" for a {th, en, ja} object
create or replace function public.tri_has(v jsonb) returns boolean
  language sql immutable
  as $$ select coalesce(nullif(v ->> 'th', ''), nullif(v ->> 'en', ''), nullif(v ->> 'ja', '')) is not null $$;

create or replace function public.documents_vendor() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  v_tax text := regexp_replace(coalesce(new.seller ->> 'taxId', ''), '\D', '', 'g');
  v_id uuid;
begin
  if length(v_tax) <> 13 or new.deleted_at is not null then
    new.vendor_id := null;
    return new;
  end if;
  insert into public.vendors as v (tax_id, name, address, branch, tel, fax)
  values (v_tax,
          coalesce(new.seller -> 'name', '{}'), coalesce(new.seller -> 'address', '{}'),
          coalesce(new.seller -> 'branch', '{}'), coalesce(new.seller ->> 'tel', ''), coalesce(new.seller ->> 'fax', ''))
  on conflict (tax_id) do update set
    name    = case when public.tri_has(v.name) then v.name else excluded.name end,
    address = case when public.tri_has(v.address) then v.address else excluded.address end,
    branch  = case when public.tri_has(v.branch) then v.branch else excluded.branch end,
    tel     = case when v.tel <> '' then v.tel else excluded.tel end,
    fax     = case when v.fax <> '' then v.fax else excluded.fax end,
    updated_at = now()
  returning id into v_id;
  new.vendor_id := v_id;
  return new;
end $$;

-- Runs after documents_stamp (alphabetical order: documents_stamp < documents_vendor)
create trigger documents_vendor before insert or update of seller, deleted_at on public.documents
  for each row execute function public.documents_vendor();
