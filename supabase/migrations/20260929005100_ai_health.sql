-- Is the AI receipt reading working? (owner 2026-11-21: "AI 모델이 바뀌면 영수증 읽기가 멈출 수 있다"): each reading
-- leaves one line — worked or not, and the error code — so the morning reminder can say when it keeps failing (a
-- retired model, a key problem). No document, photo or amount is kept here. Server only; kept 30 days.
create table if not exists public.ai_health (
  id     bigint generated always as identity primary key,
  at     timestamptz not null default now(),
  ok     boolean not null,
  code   text not null default '' check (char_length(code) <= 40),
  detail text not null default '' check (char_length(detail) <= 300)
);
create index if not exists ai_health_at on public.ai_health (at);
alter table public.ai_health enable row level security;
-- No policies: only the server (service role) reads and writes
revoke all on public.ai_health from anon, authenticated;
