-- The tax calendar (owner, 2026-10-27; ported from the for-sale version): the Thai tax deadlines, staff papers and bills
-- come from the books by themselves (lib/company-calendar.ts); this adds the company's own dates (lease renewal,
-- licence, rent …), once, monthly or yearly, with an amount and where they came from, and a "done" tick for any
-- item. Admins only (owner's choice: it shows money owed and staff visas). Adds tables and a settings column only.

create table public.calendar_events (
  id          uuid primary key default gen_random_uuid(),
  title       text not null check (length(trim(title)) between 1 and 120),
  date        date not null,
  repeat      text not null default 'none' check (repeat in ('none', 'monthly', 'yearly')),
  remind_days smallint not null default 7 check (remind_days between 0 and 90),
  note        text not null default '' check (length(note) <= 500),
  -- Satang (a rent, a licence fee …); null = none
  amount      bigint check (amount is null or amount > 0),
  -- typed in, read from a document photo by AI, or a repeating payment found in the books
  source      text not null default 'typed' check (source in ('typed', 'document', 'recurring')),
  created_by  uuid default auth.uid() references auth.users (id) on delete set null,
  created_at  timestamptz not null default now()
);
create index calendar_events_date on public.calendar_events (date);
alter table public.calendar_events enable row level security;
create policy "calendar admin" on public.calendar_events for all using (public.is_admin()) with check (public.is_admin());

-- Ticked off: "vat:2026-09", "pnd50:2025", "event:<id>:2026-11-01", "doc:<employee id>:<paper>:<expiry>" …
create table public.calendar_done (
  key     text primary key check (length(key) between 3 and 200),
  done_at timestamptz not null default now(),
  done_by uuid default auth.uid() references auth.users (id) on delete set null
);
alter table public.calendar_done enable row level security;
create policy "calendar done admin" on public.calendar_done for all using (public.is_admin()) with check (public.is_admin());

-- The repeating payments the owner said "no" to ({"dismissed": ["ledger:0105…", …]})
alter table public.company_settings add column calendar jsonb not null default '{}' check (jsonb_typeof(calendar) = 'object');

revoke all on public.calendar_events, public.calendar_done from anon;
