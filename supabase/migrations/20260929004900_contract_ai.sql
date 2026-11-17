-- AI summary kept with a contract (owner 2026-11-18, lib/contract-ai): the key terms, dates and what to watch out for,
-- written by Claude from the contract's own file. It lives on the contract row, so the contract's rules (owners and
-- unlimited admins, branch admins for a branch's contract) decide who reads it. Added only.
alter table public.contracts add column if not exists ai_summary jsonb check (ai_summary is null or jsonb_typeof(ai_summary) = 'object');
