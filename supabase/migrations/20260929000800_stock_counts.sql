-- Month-end stock (owner's choice 2026-10-01): one total per branch and month — the food and supplies left on the
-- shelves at the end of the month. Food cost then becomes what was used: purchases + last month's stock − this
-- month's (lib/stock.ts); it counts only when both months are in. Members read; admins write; closed months frozen.
-- And a monthly sales target per branch (the dashboard shows it next to the break-even point).

create table public.stock_counts (
  branch_id  uuid not null default public.head_branch() references public.branches (id) on delete restrict,
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount     numeric(14, 2) not null check (amount >= 0),
  note       text not null default '' check (length(note) <= 200),
  updated_by uuid references auth.users (id) on delete set null,
  updated_at timestamptz not null default now(),
  primary key (branch_id, month)
);
alter table public.stock_counts enable row level security;
create policy "stock read"  on public.stock_counts for select using (public.is_member());
create policy "stock admin" on public.stock_counts for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.stock_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op in ('UPDATE', 'DELETE') and public.month_locked(old.month) then
    raise exception 'month_locked: % is closed', old.month;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  if public.month_locked(new.month) then
    raise exception 'month_locked: % is closed', new.month;
  end if;
  new.updated_by := coalesce(auth.uid(), new.updated_by);
  new.updated_at := now();
  return new;
end $$;
create trigger stock_guard before insert or update or delete on public.stock_counts for each row execute function public.stock_guard();

comment on table public.stock_counts is 'Month-end stock per branch (food and supplies left), for the food cost actually used';

alter table public.branches
  add column if not exists sales_target numeric(14, 2) not null default 0 check (sales_target >= 0);
comment on column public.branches.sales_target is 'Monthly sales target without VAT (0 = none); the dashboard shows progress against it';
