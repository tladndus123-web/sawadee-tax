-- Connect Grok Bot by signing in instead of copying a key (owner, 2026-11-08): the standard MCP sign-in (OAuth 2.1 with
-- PKCE). Grok Bot registers itself (oauth_clients), an owner taps "허용" on our page, Grok Bot swaps the one-time code
-- (oauth_codes, 5 minutes, used once) for a key — an ordinary bot_keys row, listed and disconnected in settings like
-- the others. Server only: RLS on, no policies.

create table public.oauth_clients (
  client_id     text primary key check (client_id ~ '^mcp_[A-Za-z0-9]{24}$'),
  name          text not null check (length(name) between 1 and 80),
  redirect_uris text[] not null check (cardinality(redirect_uris) between 1 and 5),
  created_at    timestamptz not null default now()
);

create table public.oauth_codes (
  code_hash      text primary key check (code_hash ~ '^[0-9a-f]{64}$'),
  client_id      text not null references public.oauth_clients (client_id) on delete cascade,
  redirect_uri   text not null,
  code_challenge text not null check (code_challenge ~ '^[A-Za-z0-9_-]{43}$'),
  user_id        uuid not null references auth.users (id) on delete cascade,
  expires_at     timestamptz not null,
  used_at        timestamptz
);

alter table public.oauth_clients enable row level security;
alter table public.oauth_codes enable row level security;
revoke all on public.oauth_clients, public.oauth_codes from anon, authenticated;

-- Which sign-in connection a key came from (null = made by hand in settings)
alter table public.bot_keys add column client_id text references public.oauth_clients (client_id) on delete set null;
