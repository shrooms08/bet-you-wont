-- BYW 3c-2b-1: live proof capture sessions, proof metadata, reactions, feed ordering.
-- Safe to run more than once. RLS on, no policies (server-only access with the secret key).

-- ---------------------------------------------------------------- proof capture sessions
-- Issued right before the camera opens. Every capture burns the session code into the image or
-- video, and finalize only accepts a proof that names a valid, unexpired session for that dare,
-- owned by that doer.
create table if not exists public.proof_sessions (
  id             uuid primary key default gen_random_uuid(),
  dare_id        bigint not null,
  wallet_address text not null check (wallet_address = lower(wallet_address)),
  privy_user_id  text not null,
  code           text not null check (code ~ '^[A-Z0-9]{6}$'),
  issued_at      timestamptz not null default now(),
  expires_at     timestamptz not null,
  used_at        timestamptz
);
create index if not exists proof_sessions_dare_idx on public.proof_sessions (dare_id, wallet_address);
alter table public.proof_sessions enable row level security;

-- ---------------------------------------------------------------- proof metadata
alter table public.proofs add column if not exists captured_at timestamptz;
alter table public.proofs add column if not exists kind text;
alter table public.proofs add column if not exists duration_ms int;
alter table public.proofs add column if not exists poster_path text;
alter table public.proofs add column if not exists session_id uuid;
do $$ begin
  alter table public.proofs add constraint proofs_kind_check check (kind is null or kind in ('photo', 'video'));
exception when duplicate_object then null; end $$;

-- ---------------------------------------------------------------- reactions (🔥)
create table if not exists public.reactions (
  dare_id        bigint not null,
  wallet_address text not null check (wallet_address = lower(wallet_address)),
  created_at     timestamptz not null default now(),
  primary key (dare_id, wallet_address)
);
create index if not exists reactions_dare_idx on public.reactions (dare_id);
alter table public.reactions enable row level security;

-- ---------------------------------------------------------------- feed ordering
-- updated_at changes on every sync, so the feed sorts by real activity instead:
-- the latest of created / accepted / proof posted / settled. Sync fills these from now on.
alter table public.dares add column if not exists proof_at timestamptz;
alter table public.dares add column if not exists settled_at timestamptz;
alter table public.dares add column if not exists activity_at timestamptz;
create index if not exists dares_activity_idx on public.dares (activity_at desc, id desc);

-- Backfill what we can from existing columns (the next full sync fills in the exact values).
update public.dares
   set proof_at = coalesce(proof_at, case when vote_end is not null and vote_window is not null
                                          then vote_end - make_interval(secs => vote_window) end),
       activity_at = coalesce(activity_at, greatest(created_at, accepted_at,
                                                    case when vote_end is not null and vote_window is not null
                                                         then vote_end - make_interval(secs => vote_window) end))
 where activity_at is null;

-- ---------------------------------------------------------------- storage: proofs are live captures only
-- The in-app camera produces JPEG photos and MP4 (Safari) or WebM (Chrome/Firefox) videos.
update storage.buckets
   set allowed_mime_types = array['image/jpeg', 'video/mp4', 'video/webm']
 where id = 'proofs';
