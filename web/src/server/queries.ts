import "server-only";
import { LIVE_STATES } from "./dareRules";
import { check, db } from "./supabase";

// Shared read queries over the synced tables.

export type ProfileRow = {
  privy_user_id: string;
  wallet_address: string;
  username: string;
  avatar_url: string | null;
  ring_color: string | null;
  created_at: string;
};

export type PublicProfile = { wallet: string; username: string | null; avatarUrl: string | null; ringColor: string | null };

export type DareRow = {
  id: number;
  group_id: number;
  creator_wallet: string;
  target_wallet: string | null;
  doer_wallet: string | null;
  amount: string;
  do_duration: number;
  vote_window: number;
  meta_hash: string;
  text: string | null;
  state: string;
  outcome: string;
  accepted_at: string | null;
  proof_deadline: string | null;
  vote_end: string | null;
  proof_hash: string | null;
  eligible: number | null;
  pass_votes: number;
  fail_votes: number;
  payout: string | null;
  burned: string | null;
  created_tx: string | null;
  settled_tx: string | null;
  created_at: string | null;
  updated_at: string;
  proof_at?: string | null;
  settled_at?: string | null;
  activity_at?: string | null;
};

/** Select list for dares. Big numerics are cast to text: PostgREST would send them as lossy JSON numbers. */
export const DARE_COLUMNS =
  "id, group_id, creator_wallet, target_wallet, doer_wallet, amount::text, do_duration, vote_window, meta_hash, text, " +
  "state, outcome, accepted_at, proof_deadline, vote_end, proof_hash, eligible, pass_votes, fail_votes, payout::text, " +
  "burned::text, created_tx, settled_tx, created_at, updated_at, proof_at, settled_at, activity_at";

export type GroupRow = {
  id: number;
  name: string | null;
  is_public: boolean;
  creator_wallet: string;
  invite_code: string | null;
  created_tx: string | null;
  created_at: string | null;
};

export function toPublic(wallet: string, p: ProfileRow | undefined): PublicProfile {
  return { wallet, username: p?.username ?? null, avatarUrl: p?.avatar_url ?? null, ringColor: p?.ring_color ?? null };
}

/** Profiles keyed by lowercased wallet. */
export async function profilesByWallet(wallets: Iterable<string | null | undefined>): Promise<Map<string, ProfileRow>> {
  const list = [...new Set([...wallets].filter((w): w is string => !!w).map((w) => w.toLowerCase()))];
  const map = new Map<string, ProfileRow>();
  if (!list.length) return map;
  const rows = check(await db().from("profiles").select("*").in("wallet_address", list), "loading profiles") as ProfileRow[];
  for (const r of rows) map.set(r.wallet_address, r);
  return map;
}

/** Groups this wallet belongs to (per the synced members table), with member and live-dare counts. */
export async function groupsForWallet(wallet: string) {
  const memberships = check(
    await db().from("group_members").select("group_id, joined_at").eq("wallet_address", wallet.toLowerCase()),
    "loading memberships",
  ) as Array<{ group_id: number; joined_at: string | null }>;
  const ids = memberships.map((m) => m.group_id);
  if (!ids.length) return [];

  const [groups, members, live] = await Promise.all([
    db().from("groups").select("*").in("id", ids),
    db().from("group_members").select("group_id, wallet_address, joined_at").in("group_id", ids).order("joined_at"),
    db().from("dares").select("group_id").in("group_id", ids).in("state", LIVE_STATES as string[]),
  ]);
  const groupRows = check(groups, "loading groups") as GroupRow[];
  const memberRows = check(members, "counting members") as Array<{ group_id: number; wallet_address: string }>;
  const memberCount = countBy(memberRows);
  const liveCount = countBy(check(live, "counting dares") as Array<{ group_id: number }>);
  // Up to 5 member previews per group for avatar stacks (people with a profile first).
  const firstWallets = new Map<number, string[]>();
  for (const m of memberRows) {
    const list = firstWallets.get(Number(m.group_id)) ?? [];
    if (list.length < 12) list.push(m.wallet_address);
    firstWallets.set(Number(m.group_id), list);
  }
  const profiles = await profilesByWallet([...firstWallets.values()].flat());
  const previews = (gid: number) =>
    (firstWallets.get(gid) ?? [])
      .sort((a, b) => Number(!!profiles.get(b)) - Number(!!profiles.get(a)))
      .slice(0, 5)
      .map((w) => toPublic(w, profiles.get(w)));

  return groupRows
    .map((g) => ({
      id: g.id,
      name: g.name,
      isPublic: g.is_public,
      creatorWallet: g.creator_wallet,
      isCreator: g.creator_wallet === wallet.toLowerCase(),
      inviteCode: g.invite_code, // any member may share the invite link
      memberCount: memberCount.get(g.id) ?? 0,
      liveDareCount: liveCount.get(g.id) ?? 0,
      members: previews(Number(g.id)),
      joinedAt: memberships.find((m) => m.group_id === g.id)?.joined_at ?? null,
    }))
    .sort((a, b) => b.id - a.id);
}

function countBy(rows: Array<{ group_id: number }>) {
  const m = new Map<number, number>();
  for (const r of rows) m.set(Number(r.group_id), (m.get(Number(r.group_id)) ?? 0) + 1);
  return m;
}
