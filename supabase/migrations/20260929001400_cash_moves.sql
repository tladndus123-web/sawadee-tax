-- The shop's cash box (owner, 2026-10-08): money put in, money spent from it, and counts of what is really there.
-- The balance runs from these; a count resets it and shows the difference. Spending without a receipt counts in the
-- month's costs (no VAT to claim); spending with a receipt goes into the ledger as a document, so it is not counted
-- here twice. Everyone of a branch records; admins delete; a closed month keeps its lines.

create table public.cash_moves (
  id          uuid primary key default gen_random_uuid(),
  branch_id   uuid not null default public.head_branch() references public.branches (id) on delete restrict,
  day         date not null,
  kind        text not null check (kind in ('in', 'out', 'count')),
  amount      numeric(12, 2) not null check (amount >= 0 and amount < 10000000 and (kind = 'count' or amount > 0)),
  -- Spending only: what it was for (a cost category) and whether there is a receipt
  category    text references public.categories (key) on delete restrict,
  receipt     boolean not null default false,
  memo        text not null default '' check (length(memo) <= 200),
  created_by  uuid references auth.users (id) default auth.uid(),
  created_at  timestamptz not null default now(),
  check ((kind = 'out') = (category is not null)),
  check (kind = 'out' or not receipt)
);
create index cash_moves_branch_day on public.cash_moves (branch_id, day);

alter table public.cash_moves enable row level security;
create policy "cash read" on public.cash_moves for select using (public.is_member() and public.can_see_branch(branch_id));
create policy "cash add" on public.cash_moves for insert with check (public.is_member() and public.can_see_branch(branch_id));
create policy "cash change" on public.cash_moves for update
  using (public.is_member() and public.can_see_branch(branch_id))
  with check (public.is_member() and public.can_see_branch(branch_id));
create policy "cash delete" on public.cash_moves for delete using (public.is_admin());

-- Who made a line is stamped, and a closed month keeps its lines
create or replace function public.cash_moves_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and exists (select 1 from public.month_locks where month = to_char(old.day, 'YYYY-MM')) then
    raise exception 'month_locked: % is closed', to_char(old.day, 'YYYY-MM');
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if exists (select 1 from public.month_locks where month = to_char(new.day, 'YYYY-MM')) then
    raise exception 'month_locked: % is closed', to_char(new.day, 'YYYY-MM');
  end if;
  if tg_op = 'INSERT' then
    new.created_by := coalesce(auth.uid(), new.created_by);
    new.created_at := now();
  else
    new.created_by := old.created_by;
    new.created_at := old.created_at;
  end if;
  return new;
end $$;
create trigger cash_moves_guard before insert or update or delete on public.cash_moves
  for each row execute function public.cash_moves_guard();

comment on table public.cash_moves is 'The cash box per branch: in, out (with or without a receipt) and counts';
