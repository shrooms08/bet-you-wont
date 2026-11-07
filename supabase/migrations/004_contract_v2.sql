-- BYW contract v2 (after the 2026-11-07 audit): the voter set is fixed when a dare is created.
-- A member can vote on a dare only if their join index (1-based join order in the group, from the
-- MemberJoined event) is <= the dare's voter snapshot (the group's member count at createDare).
-- Outcome gains 'NoVotes' (proof posted, nobody voted: creator refunded 100%, no burn); `outcome`
-- is free text, so no constraint change is needed.
-- Additive only: safe to run while the old app version is still serving.

alter table public.group_members add column if not exists join_index int check (join_index is null or join_index >= 1);
alter table public.dares add column if not exists voter_snapshot int check (voter_snapshot is null or voter_snapshot >= 1);

comment on column public.group_members.join_index is '1-based join order inside the group (contract memberJoinIndex)';
comment on column public.dares.voter_snapshot is 'group member count when the dare was created; voters need join_index <= this';
comment on column public.dares.outcome is 'None | Passed | Failed | Expired | NoVotes';
