-- Descriptions on the newer tables (shown in the Supabase table editor). Also the first migration applied by the
-- GitHub Actions deploy (2026-09-29), which checks that the workflow's database step works.
comment on table public.fixed_costs is 'Fixed costs without an invoice (rent, internet, insurance …), counted every month from from_month to to_month';
comment on table public.attendance is 'Attendance per employee and day (work / off / absent / annual / sick, overtime hours); admins only';
