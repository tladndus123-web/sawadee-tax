-- Cost control for a restaurant (owner's feedback 2026-09-28): food cost, labour and rent against sales.
-- - labour has no receipts: one line per branch and month, typed in (Thai payroll: wages, the employer's social
--   security share, other staff costs). Members read; admins write; a closed month is frozen.
-- - which categories count as food cost is chosen in the category settings (food + supplies to start with)
-- - a built-in "fees" category for card / bank / payment fees
-- - target ratios, and names for the delivery-app channels, on the company settings

create table public.labor_costs (
  id              uuid primary key default gen_random_uuid(),
  branch_id       uuid not null default public.head_branch() references public.branches (id) on delete restrict,
  month           text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  wages           numeric(14, 2) not null default 0 check (wages >= 0),            -- เงินเดือน ค่าจ้าง ค่าล่วงเวลา
  social_security numeric(14, 2) not null default 0 check (social_security >= 0),  -- ประกันสังคม, employer's share
  other           numeric(14, 2) not null default 0 check (other >= 0),            -- bonus, staff meals, uniforms …
  note            text not null default '' check (length(note) <= 200),
  updated_by      uuid references auth.users (id) on delete set null,
  updated_at      timestamptz not null default now(),
  unique (branch_id, month)
);
alter table public.labor_costs enable row level security;
create policy "labor read"  on public.labor_costs for select using (public.is_member());
create policy "labor admin" on public.labor_costs for all using (public.is_admin()) with check (public.is_admin());

create or replace function public.labor_guard() returns trigger
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
create trigger labor_guard before insert or update or delete on public.labor_costs for each row execute function public.labor_guard();

alter table public.categories add column food_cost boolean not null default false;
update public.categories set food_cost = true where key in ('food', 'supplies');
-- (the guards keep new rows from being built-in; this one is added by the app itself)
alter table public.categories disable trigger categories_insert;
insert into public.categories (key, builtin, sort) values ('fees', true, 95);
alter table public.categories enable trigger categories_insert;

alter table public.company_settings
  add column cost_targets jsonb not null default '{"food": 30, "labor": 30, "rent": 10}' check (jsonb_typeof(cost_targets) = 'object'),
  add column channel_names jsonb not null default '{}' check (jsonb_typeof(channel_names) = 'object');
