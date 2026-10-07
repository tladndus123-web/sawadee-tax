-- How to pay a vendor (owner, 2026-10-08): a PromptPay ID (phone 10 digits, tax ID 13, e-wallet 15) for a QR with
-- the amount filled in, and / or a bank account to copy. Only admins set or change them: a quietly changed account
-- is how money goes to the wrong place.

alter table public.vendors
  add column pay_promptpay text not null default '' check (pay_promptpay ~ '^(0\d{9}|\d{13}|\d{15})?$'),
  add column pay_bank      text not null default '' check (length(pay_bank) <= 20),
  add column pay_account   text not null default '' check (pay_account ~ '^\d{0,20}$'),
  add column pay_name      text not null default '' check (length(pay_name) <= 120);

create or replace function public.vendors_pay_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  -- auth.uid() is null for the service role / SQL console
  if auth.uid() is not null and not public.is_admin()
     and (new.pay_promptpay, new.pay_bank, new.pay_account, new.pay_name)
         is distinct from (old.pay_promptpay, old.pay_bank, old.pay_account, old.pay_name) then
    raise exception 'only admins change payment details' using errcode = '42501';
  end if;
  return new;
end $$;

create trigger vendors_pay_guard before update on public.vendors
  for each row execute function public.vendors_pay_guard();
