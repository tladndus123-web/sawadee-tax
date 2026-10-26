-- Expense claims (owner, 2026-10-27; ported from the for-sale version): a member paid for the shop with their own money,
-- photographs the receipt and claims it back; an admin approves or rejects it (in the app or with the LINE buttons)
-- and marks it paid back, which puts the receipt into the ledger (documents.id = the claim's id, so the photo already
-- sits in the document's folder "<claim id>/…"). Members with an app account only (owner's choice). Everyone sees
-- their own claims; admins see all. Small claims can be approved by themselves (company_settings.expenses autoUnder,
-- in baht). A claim belongs to the branch the person works in. Adds tables, a column and widens the photo rule only.

alter table public.company_settings add column expenses jsonb not null default '{}' check (jsonb_typeof(expenses) = 'object');

create table public.expense_claims (
  id          uuid primary key default gen_random_uuid(),
  user_id     uuid default auth.uid() references auth.users (id) on delete set null,
  -- Who claimed, as shown (kept if the person leaves)
  name        text not null default '' check (length(name) <= 80),
  branch_id   uuid not null default public.head_branch() references public.branches (id) on delete restrict,
  day         date not null,
  seller      text not null default '' check (length(seller) <= 120),
  -- Satang
  amount      bigint not null check (amount > 0 and amount <= 1000000000),
  category    text not null default 'supplies' check (length(category) between 1 and 40),
  note        text not null default '' check (length(note) <= 500),
  photo_path  text check (length(photo_path) <= 300),
  -- The photo's fingerprint (lib/photo-hash): the same receipt claimed twice, or already in the ledger, is pointed out
  photo_hash  text check (length(photo_hash) <= 64),
  -- The AI reading of the receipt (a ledger document), used when the claim goes into the ledger
  doc         jsonb,
  status      text not null default 'pending' check (status in ('pending', 'approved', 'rejected', 'paid')),
  reason      text not null default '' check (length(reason) <= 300),
  decided_by  uuid references auth.users (id) on delete set null,
  decided_at  timestamptz,
  paid_on     date,
  paid_how    text check (paid_how in ('cash', 'transfer', 'payroll')),
  paid_by     uuid references auth.users (id) on delete set null,
  document_id uuid references public.documents (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index expense_claims_status on public.expense_claims (status, day);
create index expense_claims_user on public.expense_claims (user_id);
create index expense_claims_hash on public.expense_claims (photo_hash) where photo_hash is not null;

-- Members only ever add or change their own claims while they wait, and never decide them; their claims go to their
-- usual branch (or one they may see); small claims are approved by the company's rule; deciding and paying stamp
-- who and when; a rejected claim is never paid.
create or replace function public.expense_claims_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
declare
  staff boolean := auth.uid() is not null and not public.is_admin();
  auto_under numeric;
  home uuid;
begin
  if tg_op = 'INSERT' then
    if staff then
      new.user_id := auth.uid();
      new.status := 'pending';
      if new.branch_id is null or not public.can_see_branch(new.branch_id) then
        select m.home_branch into home from public.members m where m.user_id = auth.uid();
        new.branch_id := coalesce(home, public.head_branch());
      end if;
    end if;
    if new.status = 'pending' then
      new.decided_by := null; new.decided_at := null; new.paid_on := null; new.paid_how := null; new.paid_by := null; new.document_id := null;
      select nullif(s.expenses ->> 'autoUnder', '')::numeric into auto_under from public.company_settings s where s.id = 1;
      if coalesce(auto_under, 0) > 0 and new.amount <= round(auto_under * 100) then
        new.status := 'approved';
        new.decided_at := now();
      end if;
    end if;
    return new;
  end if;
  if staff then
    if old.status <> 'pending' or new.status <> 'pending' or new.user_id is distinct from old.user_id
       or new.branch_id is distinct from old.branch_id
       or new.decided_by is distinct from old.decided_by or new.paid_on is distinct from old.paid_on
       or new.document_id is distinct from old.document_id then
      raise exception 'expense_claims_guard: only an admin decides a claim';
    end if;
    return new;
  end if;
  if new.status is distinct from old.status then
    if new.status in ('approved', 'rejected') then
      new.decided_at := now();
      new.decided_by := auth.uid();
    elsif new.status = 'pending' then
      new.decided_at := null; new.decided_by := null; new.paid_on := null; new.paid_how := null; new.paid_by := null;
    elsif new.status = 'paid' then
      if old.status = 'rejected' then
        raise exception 'expense_claims_guard: a rejected claim is not paid';
      end if;
      new.paid_on := coalesce(new.paid_on, (now() at time zone 'Asia/Bangkok')::date);
      new.paid_by := auth.uid();
      if old.decided_at is null then
        new.decided_at := now();
        new.decided_by := auth.uid();
      end if;
    end if;
  end if;
  return new;
end $$;
create trigger expense_claims_guard before insert or update on public.expense_claims
  for each row execute function public.expense_claims_guard();
revoke all on function public.expense_claims_guard() from public, anon, authenticated;

alter table public.expense_claims enable row level security;
create policy "claims read" on public.expense_claims for select using (public.is_admin() or (public.is_member() and user_id = auth.uid()));
create policy "claims add" on public.expense_claims for insert with check (public.is_member() and (public.is_admin() or user_id = auth.uid()));
create policy "claims change" on public.expense_claims for update
  using (public.is_admin() or (public.is_member() and user_id = auth.uid() and status = 'pending'))
  with check (public.is_admin() or user_id = auth.uid());
create policy "claims remove" on public.expense_claims for delete using (public.is_admin() or (public.is_member() and user_id = auth.uid() and status = 'pending'));
revoke all on public.expense_claims from anon;

-- "경비" typed to the LINE bot puts that member in expense mode for a while: the receipt photos they send become claims
-- instead of ledger documents. Server only (service role), no policies.
create table public.line_modes (
  line_user_id text primary key check (length(line_user_id) between 5 and 64),
  mode         text not null check (mode in ('expense')),
  until        timestamptz not null
);
alter table public.line_modes enable row level security;
revoke all on public.line_modes from anon, authenticated;

-- A claim's receipt photo sits in the claim's folder ("<claim id>/…"): whoever may see the claim sees the photo
drop policy "photos read" on storage.objects;
create policy "photos read" on storage.objects for select using (
  bucket_id = 'documents' and public.is_member() and (
    public.is_admin()
    or exists (select 1 from public.documents d where d.id::text = split_part(name, '/', 1))
    or exists (select 1 from public.sales s where s.photo_path = name)
    or exists (select 1 from public.expense_claims e where e.id::text = split_part(name, '/', 1))
    or name like 'sample/%'
  )
);
