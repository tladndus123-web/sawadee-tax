-- Branch colour for the switcher (owner's choice 2026-09-28: automatic, admins may change it).
-- '' = automatic (the app picks by order); otherwise one of the app's palette names.
alter table public.branches
  add column color text not null default ''
  check (color in ('', 'blue', 'orange', 'green', 'purple', 'pink', 'teal', 'amber', 'red'));
