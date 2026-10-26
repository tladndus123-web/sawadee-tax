-- A sales target per branch and month (owner, 2026-10-26: "11월 목표" set from LINE must not become every later month's
-- target too). branches.sales_target stays as the branch's standing target for any month without its own.
-- Like that column: sales without VAT, everyone who sees the branch reads it, admins set it.
create table public.branch_targets (
  branch_id  uuid not null references public.branches (id) on delete cascade,
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  amount     numeric(14, 2) not null check (amount >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) on delete set null,
  primary key (branch_id, month)
);
comment on table public.branch_targets is 'Monthly sales target without VAT for one branch and month; months without a row use branches.sales_target';
alter table public.branch_targets enable row level security;
create policy "targets read" on public.branch_targets for select using (public.can_see_branch(branch_id));
create policy "targets admin" on public.branch_targets for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.branch_targets from anon;
