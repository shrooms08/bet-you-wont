import "server-only";
import type { Address } from "viem";
import { getGroupOnchain, groupExists, isMemberOnchain } from "./chain";
import { sleep } from "./http";
import type { GroupRow } from "./queries";
import { check, db } from "./supabase";
import { sync } from "./sync";

/** The public "world is flat crowd" group id (same env var the client uses). */
export const PUBLIC_GROUP_ID = Number(process.env.NEXT_PUBLIC_PUBLIC_GROUP_ID ?? "1");

/**
 * Can this wallet see a crew's dares? Members: yes (full). Public crews: yes (read-only).
 * Private crews: no. Membership is read from the synced table, then checked onchain when the
 * table says no (someone who just joined may not be synced yet).
 */
export async function crewAccess(groupId: number, wallet: string) {
  const [groupRes, memberRes] = await Promise.all([
    db().from("groups").select("*").eq("id", groupId).limit(1),
    db().from("group_members").select("joined_at").eq("group_id", groupId).eq("wallet_address", wallet.toLowerCase()).limit(1),
  ]);
  const group = (check(groupRes, "loading group") as GroupRow[])[0] ?? null;
  const memberRow = (check(memberRes, "loading membership") as Array<{ joined_at: string | null }>)[0];
  let member = !!memberRow;
  if (!member) member = await isMemberOnchain(BigInt(groupId), wallet as Address).catch(() => false);
  const isPublic = group ? group.is_public : await getGroupOnchain(BigInt(groupId)).then((g) => groupExists(g) && g.isPublic).catch(() => false);
  return { group, member, isPublic, joinedAt: memberRow?.joined_at ?? null, canSee: member || isPublic };
}

/** Throttled sync, capped at 1.5 s so reads stay fast (the 20 s client loop catches up the rest). */
export async function quickSync() {
  await Promise.race([sync().catch(() => null), sleep(1500)]);
}
