-- Contract box (계약서함, 2026-11-18; ported from the for-sale version, one company): the company keeps its contracts
-- (lease, supply, service, employment, loan, insurance …) with who it is with, the dates, the money and a scan or photo,
-- and finds them again by name, kind or "ends soon" (lib/contracts, /contracts). Admins only — a contract holds money
-- terms and personal data. The file lives in the private documents bucket under "contracts/<contract id>/…": admins
-- already read ("photos read": is_admin) and remove ("photos remove") there; adding a file there is now admins only too.
-- LINE: "계약서" typed by an admin → contract mode (line_modes.mode 'contract'), the next photo / PDF becomes a contract.

create table public.contracts (
  id uuid primary key default gen_random_uuid(),
  title text not null check (length(btrim(title)) between 1 and 120),
  party text not null default '' check (length(party) <= 120),
  kind text not null default 'other' check (kind in ('lease', 'supply', 'service', 'employment', 'loan', 'insurance', 'partnership', 'other')),
  start_on date,
  end_on date,
  -- Renews by itself unless someone says no: "ends soon" then means "say no before this day"
  auto_renew boolean not null default false,
  -- How many days before the end the box warns
  notice_days int not null default 30 check (notice_days between 0 and 365),
  -- Money in the contract (rent a month, the fee, the total), in satang like every amount in the books; null = none
  amount bigint check (amount is null or (amount >= 0 and amount < 100000000000000)),
  note text not null default '' check (length(note) <= 1000),
  file_path text check (file_path is null or (length(file_path) <= 300 and file_path like 'contracts/%')),
  file_name text check (file_name is null or length(file_name) <= 200),
  file_type text check (file_type is null or file_type in ('image/jpeg', 'image/png', 'image/webp', 'application/pdf')),
  -- Optional: the branch the contract is for (a shop's lease); null = the whole company
  branch_id uuid references public.branches (id) on delete set null,
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint contracts_dates check (start_on is null or end_on is null or end_on >= start_on)
);
create index contracts_end on public.contracts (end_on);

alter table public.contracts enable row level security;
create policy "contracts admins" on public.contracts for all using (public.is_admin()) with check (public.is_admin());
revoke all on public.contracts from anon;
grant select, insert, update, delete on public.contracts to authenticated;

create or replace function public.contracts_stamp() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger contracts_stamp before update on public.contracts for each row execute function public.contracts_stamp();

-- Only admins put files in the contracts folder (any member may add receipt photos elsewhere in the bucket)
create policy "contract files admins" on storage.objects as restrictive for insert
  with check (bucket_id <> 'documents' or objects.name not like 'contracts/%' or public.is_admin());
create policy "contract files admins update" on storage.objects as restrictive for update
  using (bucket_id <> 'documents' or objects.name not like 'contracts/%' or public.is_admin());

-- A scanned contract is often bigger than the 5 MB a receipt photo needs
update storage.buckets set file_size_limit = 15728640 where id = 'documents' and coalesce(file_size_limit, 0) < 15728640;

-- LINE contract mode next to expense mode
alter table public.line_modes drop constraint if exists line_modes_mode_check;
alter table public.line_modes add constraint line_modes_mode_check check (mode in ('expense', 'contract'));
