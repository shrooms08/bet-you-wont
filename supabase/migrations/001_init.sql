-- BYW (Bet You Won't) initial schema. Safe to run more than once.
-- Every table has RLS enabled with NO policies: the publishable/anon key can read or write nothing.
-- All access goes through the Next.js server using the secret (service_role) key, which bypasses RLS.
-- Wallet addresses are stored lowercased everywhere.

create extension if not exists citext;

-- ---------------------------------------------------------------- profiles
create table if not exists public.profiles (
  privy_user_id  text primary key,
  wallet_address text unique not null check (wallet_address = lower(wallet_address)),
  -- cast to text so the regex is case-sensitive (citext's ~ ignores case): stored usernames are lowercase
  username       citext unique not null check (username::text ~ '^[a-z0-9_]{3,20}$'),
  avatar_url     text,
  ring_color     text,
  created_at     timestamptz not null default now()
);

-- ---------------------------------------------------------------- groups
create table if not exists public.groups (
  id             bigint primary key,                 -- onchain groupId
  name           text check (name is null or char_length(name) between 1 and 40),
  is_public      boolean not null,
  creator_wallet text not null,
  invite_code    text unique,
  created_tx     text,
  created_at     timestamptz default now()
);

create table if not exists public.group_members (
  group_id       bigint not null,
  wallet_address text not null,
  joined_at      timestamptz,
  join_tx        text,
  primary key (group_id, wallet_address)
);

-- ---------------------------------------------------------------- dares
create table if not exists public.dare_drafts (
  meta_hash      text primary key,                   -- 0x-prefixed bytes32
  group_id       bigint,
  creator_wallet text,
  text           text not null,
  salt           text,
  created_at     timestamptz not null default now()
);

create table if not exists public.dares (
  id             bigint primary key,                 -- onchain dareId
  group_id       bigint,
  creator_wallet text,
  target_wallet  text,
  doer_wallet    text,
  amount         numeric(78,0),
  do_duration    int,
  vote_window    int,
  meta_hash      text,
  text           text,                               -- copied from dare_drafts by meta_hash during sync
  state          text,                               -- Open | Accepted | Voting | Settled | Cancelled
  outcome        text,                               -- None | Passed | Failed | Expired
  accepted_at    timestamptz,
  proof_deadline timestamptz,
  vote_end       timestamptz,
  proof_hash     text,
  eligible       int,
  pass_votes     int default 0,
  fail_votes     int default 0,
  payout         numeric(78,0),
  burned         numeric(78,0),
  created_tx     text,
  settled_tx     text,
  created_at     timestamptz,
  updated_at     timestamptz default now()
);
-- in case an earlier draft of this table was created without it
alter table public.dares add column if not exists text text;

create table if not exists public.votes (
  dare_id        bigint not null,
  voter_wallet   text not null,
  pass           boolean,
  tx_hash        text,
  created_at     timestamptz,
  primary key (dare_id, voter_wallet)
);

create table if not exists public.proofs (
  proof_hash      text primary key,                  -- 0x-prefixed sha256 of the file bytes
  dare_id         bigint,
  uploader_wallet text,
  storage_path    text,
  mime            text,
  size_bytes      int,
  created_at      timestamptz not null default now()
);

-- ---------------------------------------------------------------- infra
create table if not exists public.sync_state (
  id          int primary key default 1 check (id = 1),
  last_block  bigint not null,
  updated_at  timestamptz,                           -- when the last successful sync finished
  lock_holder text,
  lock_until  timestamptz
);
alter table public.sync_state add column if not exists lock_holder text;
alter table public.sync_state add column if not exists lock_until timestamptz;

create table if not exists public.rate_limits (
  key          text primary key,
  count        int,
  window_start timestamptz
);

-- ---------------------------------------------------------------- indexes
create index if not exists dares_group_created_idx  on public.dares (group_id, created_at desc);
create index if not exists dares_state_idx          on public.dares (state);
create index if not exists dares_meta_hash_idx      on public.dares (meta_hash);
create index if not exists group_members_wallet_idx on public.group_members (wallet_address);
create index if not exists votes_voter_idx          on public.votes (voter_wallet);
create index if not exists proofs_dare_idx          on public.proofs (dare_id);

-- ---------------------------------------------------------------- RLS: on, no policies
alter table public.profiles      enable row level security;
alter table public.groups        enable row level security;
alter table public.group_members enable row level security;
alter table public.dare_drafts   enable row level security;
alter table public.dares         enable row level security;
alter table public.votes         enable row level security;
alter table public.proofs        enable row level security;
alter table public.sync_state    enable row level security;
alter table public.rate_limits   enable row level security;

-- ---------------------------------------------------------------- functions (server only)

-- Fixed-window rate limiter. One atomic statement: counts this hit and says whether it is allowed.
create or replace function public.rate_limit_hit(p_key text, p_limit int, p_window_seconds int)
returns table (allowed boolean, hits int, reset_at timestamptz)
language plpgsql
set search_path = public
as $$
declare
  r public.rate_limits;
begin
  insert into public.rate_limits as rl (key, count, window_start)
  values (p_key, 1, now())
  on conflict (key) do update set
    count = case when rl.window_start <= now() - make_interval(secs => p_window_seconds)
                 then 1 else rl.count + 1 end,
    window_start = case when rl.window_start <= now() - make_interval(secs => p_window_seconds)
                 then now() else rl.window_start end
  returning * into r;
  return query select r.count <= p_limit, r.count, r.window_start + make_interval(secs => p_window_seconds);
end;
$$;

-- Sync lease. Takes the single sync_state row lock, so concurrent callers serialize here.
-- Returns acquired=false with reason 'busy' (another sync holds an unexpired lease) or
-- 'throttled' (last successful sync finished less than p_min_interval_seconds ago).
-- The lease expires on its own after p_ttl_seconds, so a crashed sync cannot block forever.
create or replace function public.sync_try_lock(
  p_holder text, p_ttl_seconds int, p_min_interval_seconds numeric, p_start_block bigint
)
returns table (acquired boolean, last_block bigint, reason text)
language plpgsql
set search_path = public
as $$
declare
  s public.sync_state;
begin
  insert into public.sync_state (id, last_block) values (1, p_start_block) on conflict (id) do nothing;
  select * into s from public.sync_state where id = 1 for update;
  if s.lock_until is not null and s.lock_until > now() then
    return query select false, s.last_block, 'busy'::text;
    return;
  end if;
  if p_min_interval_seconds > 0 and s.updated_at is not null
     and s.updated_at > now() - make_interval(secs => p_min_interval_seconds::double precision) then
    return query select false, s.last_block, 'throttled'::text;
    return;
  end if;
  update public.sync_state
     set lock_holder = p_holder, lock_until = now() + make_interval(secs => p_ttl_seconds)
   where id = 1;
  return query select true, s.last_block, 'ok'::text;
end;
$$;

-- Release the lease. Pass p_last_block on success (advances the cursor and stamps updated_at);
-- pass null on failure (releases only, so the next call retries the same range).
create or replace function public.sync_unlock(p_holder text, p_last_block bigint)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update public.sync_state
     set last_block  = case when p_last_block is null then last_block else greatest(last_block, p_last_block) end,
         updated_at  = case when p_last_block is null then updated_at else now() end,
         lock_holder = null,
         lock_until  = null
   where id = 1 and lock_holder = p_holder;
  return found;
end;
$$;

-- Functions in public are exposed over the REST API: only the server's secret key may call them.
revoke all on function public.rate_limit_hit(text, int, int)                 from public, anon, authenticated;
revoke all on function public.sync_try_lock(text, int, numeric, bigint)      from public, anon, authenticated;
revoke all on function public.sync_unlock(text, bigint)                      from public, anon, authenticated;
grant execute on function public.rate_limit_hit(text, int, int)              to service_role;
grant execute on function public.sync_try_lock(text, int, numeric, bigint)   to service_role;
grant execute on function public.sync_unlock(text, bigint)                   to service_role;

-- ---------------------------------------------------------------- storage buckets (public read)
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'proofs', 'proofs', true, 52428800,
  array['image/jpeg','image/png','image/webp','image/heic','video/mp4','video/quicktime','video/webm']
)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 5242880, array['image/jpeg','image/png','image/webp'])
on conflict (id) do nothing;
