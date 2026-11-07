-- BYW audit fixes (AUDIT.md: M-1, M-4, M-5, L-7, public permits, reports/moderation, blocks, deletion).
-- Safe to run more than once. Like every table here: RLS on, no policies (server secret key only).

-- ---------------------------------------------------------------- M-1: proofs bucket is private
-- Proof media is served only through short-lived signed URLs the server creates for viewers who
-- may see the dare. Avatars stay public.
update storage.buckets set public = false where id = 'proofs';

-- ---------------------------------------------------------------- M-4: upload ledger
-- Every signed upload URL we issue. Used for per-user budgets, one in-flight upload per capture
-- session (per role: the media file and, for videos, its poster), and deleting a retaken upload.
create table if not exists public.uploads (
  id             uuid primary key default gen_random_uuid(),
  privy_user_id  text not null,
  wallet_address text not null check (wallet_address = lower(wallet_address)),
  kind           text not null check (kind in ('proof', 'avatar')),
  path           text not null unique,
  declared_bytes bigint not null check (declared_bytes >= 0),
  session_id     uuid,
  role           text check (role is null or role in ('media', 'poster')),
  status         text not null default 'issued' check (status in ('issued', 'finalized', 'deleted')),
  created_at     timestamptz not null default now()
);
create index if not exists uploads_user_kind_idx on public.uploads (privy_user_id, kind, created_at desc);
create index if not exists uploads_session_idx on public.uploads (session_id, role);
alter table public.uploads enable row level security;

-- ---------------------------------------------------------------- M-5: sync commits per chunk
-- Advances the cursor while still holding the lease (and extends the lease). Returns false if the
-- caller no longer holds it, so a stale worker can never move the cursor.
create or replace function public.sync_progress(p_holder text, p_last_block bigint, p_ttl_seconds int)
returns boolean
language plpgsql
set search_path = public
as $$
begin
  update public.sync_state
     set last_block = greatest(last_block, p_last_block),
         lock_until = now() + make_interval(secs => p_ttl_seconds)
   where id = 1 and lock_holder = p_holder and lock_until > now();
  return found;
end;
$$;
revoke all on function public.sync_progress(text, bigint, int) from public, anon, authenticated;
grant execute on function public.sync_progress(text, bigint, int) to service_role;

-- ---------------------------------------------------------------- L-7: atomic invite codes
-- Registers (or renames) a group in one statement. An existing invite code is never replaced here;
-- concurrent registrations all end up with the same, first code.
create or replace function public.register_group(
  p_id bigint, p_name text, p_is_public boolean, p_creator text, p_tx text, p_code text
)
returns setof public.groups
language plpgsql
set search_path = public
as $$
begin
  return query
  insert into public.groups as g (id, name, is_public, creator_wallet, created_tx, invite_code)
  values (p_id, p_name, p_is_public, lower(p_creator), p_tx, p_code)
  on conflict (id) do update set
    name           = excluded.name,
    is_public      = excluded.is_public,
    creator_wallet = excluded.creator_wallet,
    created_tx     = coalesce(g.created_tx, excluded.created_tx),
    invite_code    = coalesce(g.invite_code, excluded.invite_code)
  returning *;
end;
$$;
revoke all on function public.register_group(bigint, text, boolean, text, text, text) from public, anon, authenticated;
grant execute on function public.register_group(bigint, text, boolean, text, text, text) to service_role;

-- ---------------------------------------------------------------- public wifie permits
-- At most one wallet per Privy user may get a permit for a public wifie.
create table if not exists public.public_permits (
  privy_user_id  text not null,
  group_id       bigint not null,
  wallet_address text not null check (wallet_address = lower(wallet_address)),
  created_at     timestamptz not null default now(),
  primary key (privy_user_id, group_id)
);
create index if not exists public_permits_wallet_idx on public.public_permits (group_id, wallet_address);
alter table public.public_permits enable row level security;

-- ---------------------------------------------------------------- reports and moderation
create table if not exists public.reports (
  id               uuid primary key default gen_random_uuid(),
  dare_id          bigint not null,
  target           text not null check (target in ('dare', 'proof')),
  reason           text not null check (reason in ('dangerous', 'illegal', 'no_consent', 'harassment', 'nudity', 'other')),
  details          text check (details is null or char_length(details) <= 280),
  reporter_user_id text not null,
  reporter_wallet  text not null check (reporter_wallet = lower(reporter_wallet)),
  created_at       timestamptz not null default now(),
  unique (dare_id, target, reporter_user_id)
);
create index if not exists reports_dare_idx on public.reports (dare_id, target, created_at desc);
create index if not exists reports_reporter_idx on public.reports (reporter_wallet);
alter table public.reports enable row level security;

-- Hidden = removed from every view (and share cards/previews) until an admin clears it.
-- *_cleared_at: an admin reviewed it and unhid it; only reports after that time count again.
alter table public.dares add column if not exists text_hidden_at timestamptz;
alter table public.dares add column if not exists text_hidden_by text check (text_hidden_by is null or text_hidden_by in ('auto', 'admin'));
alter table public.dares add column if not exists text_cleared_at timestamptz;
alter table public.dares add column if not exists media_hidden_at timestamptz;
alter table public.dares add column if not exists media_hidden_by text check (media_hidden_by is null or media_hidden_by in ('auto', 'admin'));
alter table public.dares add column if not exists media_cleared_at timestamptz;

-- A proof file an admin (or its owner, via data deletion) removed for good.
alter table public.proofs add column if not exists deleted_at timestamptz;

-- Blocked profiles can't create dares or join public wifies in the app.
alter table public.profiles add column if not exists blocked_at timestamptz;

-- Every admin action, for accountability.
create table if not exists public.admin_log (
  id           uuid primary key default gen_random_uuid(),
  admin_wallet text not null,
  action       text not null,
  dare_id      bigint,
  wallet       text,
  created_at   timestamptz not null default now()
);
alter table public.admin_log enable row level security;
