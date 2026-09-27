-- Automatic registration rules per vendor (freee-style 自動登録ルール, owner's decision 2026-09-27):
--   rule_category / rule_payment: always use this category / payment for the vendor's new documents
--   auto_register: a new document of this vendor that passes every automatic check is saved to the ledger
--                  without a person confirming it. Only admins may switch it on or off (it skips review).

alter table public.vendors
  add column rule_category text check (rule_category in ('food', 'transport', 'fuel', 'office', 'supplies', 'utilities', 'rent', 'entertainment', 'other')),
  add column rule_payment  text check (rule_payment in ('credit', 'cash', 'transfer', 'card', 'other')),
  add column auto_register boolean not null default false;

create or replace function public.vendors_rule_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if new.auto_register is distinct from old.auto_register and not public.is_admin() then
    raise exception 'only admins change automatic registration' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger vendors_rule_guard before update of auto_register on public.vendors
  for each row execute function public.vendors_rule_guard();
