-- Sales (the money coming in), owner's decision 2026-09-27: store (POS) and delivery apps, entered from the POS
-- closing report (Z report) photo or a POS Excel file. One line per day and channel — the way a retail shop keeps
-- its sales tax report (รายงานภาษีขาย): the day's abbreviated tax invoices as one line with their number range.
-- Feeds the sales tax report and the monthly result (sales − purchases). Closed months cannot change.

create table public.sales (
  id          uuid primary key default gen_random_uuid(),
  sale_date   date not null,
  channel     text not null default 'store'
              check (channel in ('store', 'grab', 'lineman', 'foodpanda', 'shopee', 'robinhood', 'other')),
  doc_from    text not null default '',  -- first abbreviated tax invoice number of the day
  doc_to      text not null default '',  -- last one
  bills       integer not null default 0 check (bills >= 0),
  gross       numeric(14, 2) not null default 0 check (gross >= 0),  -- VAT included
  vat         numeric(14, 2) not null default 0 check (vat >= 0),
  exempt      numeric(14, 2) not null default 0 check (exempt >= 0),
  note        text not null default '',
  photo_path  text,
  source      text not null default 'manual' check (source in ('photo', 'excel', 'manual')),
  created_by  uuid references auth.users (id) on delete set null,
  created_at  timestamptz not null default now(),
  updated_by  uuid references auth.users (id) on delete set null,
  updated_at  timestamptz not null default now(),
  unique (sale_date, channel),
  check (vat + exempt <= gross)
);

alter table public.sales enable row level security;
create policy "sales read"   on public.sales for select using (public.is_member());
create policy "sales add"    on public.sales for insert with check (public.is_member());
create policy "sales change" on public.sales for update using (public.is_member()) with check (public.is_member());
create policy "sales remove" on public.sales for delete using (public.is_admin());

-- Who / when, and nothing moves into, out of or inside a closed month
create or replace function public.sales_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and public.month_locked(to_char(old.sale_date, 'YYYY-MM')) then
    raise exception 'month_locked: % is closed', to_char(old.sale_date, 'YYYY-MM');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if public.month_locked(to_char(new.sale_date, 'YYYY-MM')) then
    raise exception 'month_locked: % is closed', to_char(new.sale_date, 'YYYY-MM');
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;

create trigger sales_guard before insert or update or delete on public.sales
  for each row execute function public.sales_guard();
