-- "📤 Send to the accountant" (owner, 2026-10-26, month-end LINE report): an admin makes a link that shows one
-- month's books — summary, purchase list with photos, sales, Excel — without signing in, until it expires.
-- Server only (RLS on, no policies): the share page reads it with the service role and checks the token itself.
create table public.accountant_shares (
  token      text primary key check (token ~ '^[A-Za-z0-9_-]{32,64}$'),
  month      text not null check (month ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  created_by uuid references auth.users (id) on delete set null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default now() + interval '30 days',
  revoked_at timestamptz,
  check (expires_at > created_at and expires_at <= created_at + interval '90 days')
);
alter table public.accountant_shares enable row level security;
revoke all on public.accountant_shares from anon, authenticated;
