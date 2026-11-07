-- BYW 3c-2b-2: 18+ confirmation, Dare Score / weekly streak stats, streak freezes.
-- Safe to run more than once. RLS on, no policies (server-only access with the secret key).

-- ---------------------------------------------------------------- 18+ gate
-- Set when the user ticks "i'm 18 or older and i'll keep dares safe and legal".
alter table public.profiles add column if not exists age_confirmed_at timestamptz;

-- ---------------------------------------------------------------- per-wallet stats (recomputed after each sync)
-- Score is points, not money. All $wif amounts are wei (numeric(78,0)), read back as text.
create table if not exists public.user_stats (
  wallet_address text primary key check (wallet_address = lower(wallet_address)),
  score          int not null default 0,          -- all-time points (streak multiplier applied)
  score_week     int not null default 0,          -- points in the current ISO week (UTC)
  current_streak int not null default 0,          -- consecutive qualifying ISO weeks
  best_streak    int not null default 0,
  week_qualified boolean not null default false,  -- has the current ISO week qualified yet?
  dares_done     int not null default 0,          -- Passed dares as the doer
  dares_dared    int not null default 0,          -- dares created (not counting cancelled)
  wif_won        numeric(78,0) not null default 0, -- payouts received as the doer of Passed dares
  wif_burned     numeric(78,0) not null default 0, -- burns from bounties you put up + your streak-freeze burns
  updated_at     timestamptz not null default now()
);
create index if not exists user_stats_score_idx on public.user_stats (score desc);
alter table public.user_stats enable row level security;

-- ---------------------------------------------------------------- streak freezes
-- A verified burn of 2,000 $wif that makes one ISO week count for the streak (no points).
-- One per Privy user per week; each burn transaction can be used once.
create table if not exists public.streak_freezes (
  id             bigint generated always as identity primary key,
  wallet_address text not null check (wallet_address = lower(wallet_address)),
  privy_user_id  text not null,
  week           text not null check (week ~ '^[0-9]{4}-W[0-9]{2}$'), -- ISO week, e.g. 2026-W45
  tx_hash        text not null unique,
  amount         numeric(78,0) not null,
  created_at     timestamptz not null default now(),
  unique (privy_user_id, week)
);
create index if not exists streak_freezes_wallet_idx on public.streak_freezes (wallet_address, week);
alter table public.streak_freezes enable row level security;
