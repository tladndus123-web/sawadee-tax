-- Regular closing days of each branch (0 = Sunday … 6 = Saturday, as in JavaScript getUTCDay / Postgres dow).
-- The sales page does not count those days as "sales missing". Admins set them with the branch (same rules).
alter table public.branches
  add column if not exists closed_days smallint[] not null default '{}';

alter table public.branches drop constraint if exists branches_closed_days_check;
alter table public.branches
  add constraint branches_closed_days_check check (closed_days <@ array[0, 1, 2, 3, 4, 5, 6]::smallint[]);

comment on column public.branches.closed_days is 'Regular closing weekdays (0 = Sunday … 6 = Saturday); those days are not counted as missing sales';
