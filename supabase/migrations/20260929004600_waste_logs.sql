-- Waste log (owner 2026-11-18: a restaurant extra, off until switched on in Settings → 음식점 기능; chose "영업용에 따로"):
-- what the kitchen threw away — item, quantity, unit, value, reason, an optional photo — per branch and day. Its own
-- table: Sawadee STOCK's stock_* tables are not touched. Anyone who may see the branch records and reads; the person
-- who recorded a line, or an admin of the branch, changes or removes it. Photos sit in the private documents bucket under
-- "waste/<log id>/…" (members may add photos already; reading is opened for the branch's people by a policy of its own).
-- Added only: nothing existing is renamed or removed.

create table public.waste_logs (
  id uuid primary key default gen_random_uuid(),
  branch_id uuid not null default public.head_branch() references public.branches (id) on delete restrict,
  day date not null default ((now() at time zone 'Asia/Bangkok')::date),
  item text not null check (length(btrim(item)) between 1 and 80),
  qty numeric(12, 3) not null default 1 check (qty > 0 and qty < 1000000),
  unit text not null default '' check (length(unit) <= 20),
  -- What it was worth, baht (null = not known)
  amount numeric(12, 2) check (amount is null or (amount >= 0 and amount < 100000000)),
  reason text not null default 'spoiled' check (reason in ('spoiled', 'expired', 'mistake', 'dropped', 'leftover', 'other')),
  note text not null default '' check (length(note) <= 300),
  photo_path text check (photo_path is null or (photo_path like 'waste/%' and length(photo_path) <= 300)),
  source text not null default 'app' check (source in ('app', 'line')),
  created_by uuid default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index waste_logs_day on public.waste_logs (day desc, branch_id);

alter table public.waste_logs enable row level security;
create policy "waste read" on public.waste_logs for select using (public.is_member() and public.can_see_branch(branch_id));
create policy "waste add" on public.waste_logs for insert with check (public.is_member() and public.can_see_branch(branch_id) and created_by = auth.uid());
create policy "waste change" on public.waste_logs for update
  using (public.is_member() and public.can_see_branch(branch_id) and (created_by = auth.uid() or public.admin_for(branch_id)))
  with check (public.can_see_branch(branch_id) and (created_by = auth.uid() or public.admin_for(branch_id)));
create policy "waste remove" on public.waste_logs for delete using (public.is_member() and public.can_see_branch(branch_id) and (created_by = auth.uid() or public.admin_for(branch_id)));
revoke all on public.waste_logs from anon;
grant select, insert, update, delete on public.waste_logs to authenticated;

create or replace function public.waste_logs_stamp() returns trigger
  language plpgsql as $$
begin
  new.updated_at := now();
  return new;
end $$;
create trigger waste_logs_stamp before update on public.waste_logs for each row execute function public.waste_logs_stamp();

-- A waste photo can be read by whoever can read its line (admins read every photo already)
create policy "waste photos read" on storage.objects for select using (
  bucket_id = 'documents' and objects.name like 'waste/%' and public.is_member()
  and exists (select 1 from public.waste_logs w where w.photo_path = objects.name and public.can_see_branch(w.branch_id))
);
