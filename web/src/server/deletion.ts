import "server-only";
import { dropSignedUrls } from "./dareView";
import { UPLOAD_RULES } from "./media";
import { check, db } from "./supabase";

async function listFolder(bucket: string, prefix: string): Promise<string[]> {
  const out: string[] = [];
  for (let offset = 0; ; offset += 1000) {
    const { data, error } = await db().storage.from(bucket).list(prefix, { limit: 1000, offset });
    if (error) throw new Error(`list ${bucket}/${prefix}: ${error.message}`);
    for (const f of data ?? []) if (f.id !== null) out.push(`${prefix}/${f.name}`);
    if (!data || data.length < 1000) return out;
  }
}

async function removeAll(bucket: string, paths: string[]) {
  for (let i = 0; i < paths.length; i += 100) {
    const { error } = await db().storage.from(bucket).remove(paths.slice(i, i + 100));
    if (error) throw new Error(`remove from ${bucket}: ${error.message}`);
  }
}

/** Permanently deletes one dare's proof file (and poster). The proof row stays, marked deleted. */
export async function deleteProofFiles(dareId: number) {
  const rows = check(
    await db().from("proofs").select("proof_hash, storage_path, poster_path").eq("dare_id", dareId),
    "loading proof",
  ) as Array<{ proof_hash: string; storage_path: string | null; poster_path: string | null }>;
  const paths = rows.flatMap((r) => [r.storage_path, r.poster_path]).filter((p): p is string => !!p);
  await removeAll(UPLOAD_RULES.proof.bucket, paths);
  dropSignedUrls(paths);
  if (rows.length) await db().from("proofs").update({ deleted_at: new Date().toISOString() }).eq("dare_id", dareId);
  return paths.length;
}

/**
 * "Delete my data": removes the profile (freeing the @name), the avatar, every proof file the
 * user's wallets uploaded (finalized or not) and their reactions. Onchain records (dares, votes,
 * joins, bounties) can't be deleted and stay. Used by the user themself and by admins.
 */
export async function deleteUserData(target: { privyUserId: string | null; wallets: string[] }) {
  const wallets = [...new Set(target.wallets.map((w) => w.toLowerCase()))];
  // the profile's wallet too, if we were given only the user id
  if (target.privyUserId) {
    const rows = check(await db().from("profiles").select("wallet_address").eq("privy_user_id", target.privyUserId), "loading profile") as Array<{ wallet_address: string }>;
    for (const r of rows) if (!wallets.includes(r.wallet_address)) wallets.push(r.wallet_address);
  }

  let files = 0;
  for (const w of wallets) {
    const avatars = await listFolder(UPLOAD_RULES.avatar.bucket, `avatar/${w}`);
    await removeAll(UPLOAD_RULES.avatar.bucket, avatars);
    const proofs = await listFolder(UPLOAD_RULES.proof.bucket, `proof/${w}`);
    await removeAll(UPLOAD_RULES.proof.bucket, proofs);
    dropSignedUrls(proofs);
    files += avatars.length + proofs.length;
  }
  if (wallets.length) {
    await db().from("proofs").update({ deleted_at: new Date().toISOString() }).in("uploader_wallet", wallets);
    await db().from("reactions").delete().in("wallet_address", wallets);
  }
  if (target.privyUserId) {
    await db().from("uploads").delete().eq("privy_user_id", target.privyUserId);
    await db().from("profiles").delete().eq("privy_user_id", target.privyUserId);
  }
  if (wallets.length) await db().from("profiles").delete().in("wallet_address", wallets);
  return { wallets: wallets.length, files };
}
