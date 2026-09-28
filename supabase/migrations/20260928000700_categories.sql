-- Categories the admins keep (owner's request 2026-09-28): the built-in ones can be renamed or hidden, new ones
-- added (key "c_…"), each with a name in the four screen languages, an icon and colour, a hint for the AI, and
-- whether its input VAT may be claimed. Documents keep the key as text, so nothing else changes.
-- A category that documents use cannot be deleted (hide it instead); built-in ones are never deleted.

create table public.categories (
  key         text primary key check (key ~ '^[a-z]+$' or key ~ '^c_[a-z0-9]{4,12}$'),
  builtin     boolean not null default false,
  name        jsonb not null default '{}' check (jsonb_typeof(name) = 'object'),   -- {ko, th, en, ja}; empty = built-in name
  hint        text not null default '' check (length(hint) <= 300),              -- what belongs here, for the AI
  icon        text not null default '' check (icon ~ '^[a-z-]{0,24}$'),
  color       text not null default '' check (color in ('', 'blue', 'orange', 'green', 'purple', 'pink', 'teal', 'amber', 'red', 'slate')),
  vat_blocked boolean not null default false,
  hidden      boolean not null default false,
  sort        int not null default 0,
  updated_at  timestamptz not null default now()
);
alter table public.categories enable row level security;
create policy "categories read"  on public.categories for select using (public.is_member());
create policy "categories admin" on public.categories for all using (public.is_admin()) with check (public.is_admin());

insert into public.categories (key, builtin, sort) values
  ('food', true, 10), ('transport', true, 20), ('fuel', true, 30), ('office', true, 40), ('supplies', true, 50),
  ('consumables', true, 60), ('repairs', true, 70), ('utilities', true, 80), ('rent', true, 90),
  ('entertainment', true, 100), ('asset', true, 110), ('other', true, 120);
update public.categories set vat_blocked = true where key = 'entertainment';

create or replace function public.categories_guard() returns trigger
  language plpgsql security definer set search_path = public as $$
begin
  if tg_op = 'DELETE' then
    if old.builtin then
      raise exception 'category_builtin: % cannot be deleted', old.key;
    end if;
    if exists (select 1 from public.documents where category = old.key)
       or exists (select 1 from public.document_items where category = old.key)
       or exists (select 1 from public.vendors where rule_category = old.key) then
      raise exception 'category_in_use: % is used', old.key;
    end if;
    return old;
  end if;
  -- a built-in category stays built-in, and "other" (the fallback) stays visible
  new.builtin := old.builtin;
  if new.key = 'other' then new.hidden := false; end if;
  new.updated_at := now();
  return new;
end $$;
create trigger categories_guard before update or delete on public.categories for each row execute function public.categories_guard();

-- New rows are never built-in
create or replace function public.categories_insert() returns trigger
  language plpgsql as $$
begin
  new.builtin := false;
  return new;
end $$;
create trigger categories_insert before insert on public.categories for each row execute function public.categories_insert();
