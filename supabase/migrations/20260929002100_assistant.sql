-- The LINE AI assistant (owner, 2026-10-26): admins talk to the bot; Haiku answers, Sonnet 5.5 takes long analyses
-- (at most 10 a month for the whole company). Both tables are server-only (RLS on, no policies).

-- The recent conversation per person, so a follow-up question has its context (the server keeps 30 days)
create table public.assistant_turns (
  id         bigserial primary key,
  user_id    uuid not null references auth.users (id) on delete cascade,
  role       text not null check (role in ('user', 'assistant')),
  content    text not null check (length(content) <= 8000),
  model      text not null default '',
  created_at timestamptz not null default now()
);
create index assistant_turns_user on public.assistant_turns (user_id, created_at desc);
alter table public.assistant_turns enable row level security;

-- How many answers each model gave in a month (Bangkok month, "YYYY-MM")
create table public.assistant_usage (
  month text not null check (month ~ '^\d{4}-\d{2}$'),
  model text not null check (length(model) between 1 and 60),
  uses  int  not null default 0 check (uses >= 0),
  primary key (month, model)
);
alter table public.assistant_usage enable row level security;

revoke all on public.assistant_turns, public.assistant_usage from anon, authenticated;
revoke all on sequence public.assistant_turns_id_seq from anon, authenticated;

-- Takes one use of a model for the month if the limit allows: the new count, or -1 when the limit is reached.
-- One statement, so two questions at the same moment cannot both take the last use.
create or replace function public.assistant_claim(p_month text, p_model text, p_limit int) returns int
  language plpgsql security definer set search_path = public as $$
declare
  n int;
begin
  insert into public.assistant_usage (month, model) values (p_month, p_model) on conflict do nothing;
  update public.assistant_usage set uses = uses + 1 where month = p_month and model = p_model and uses < p_limit returning uses into n;
  return coalesce(n, -1);
end $$;
revoke all on function public.assistant_claim(text, text, int) from public, anon, authenticated;
grant execute on function public.assistant_claim(text, text, int) to service_role;
