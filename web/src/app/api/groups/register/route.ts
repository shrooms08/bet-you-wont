import { parseEventLogs, type TransactionReceipt } from "viem";
import { escrowAbi, escrowAddress } from "@/lib/contracts";
import { ownsWallet, requireCaller } from "@/server/auth";
import { publicClient } from "@/server/chain";
import { newInviteCode } from "@/server/hashing";
import { ApiError, ok, readJson, route } from "@/server/http";
import type { GroupRow } from "@/server/queries";
import { enforceRateLimit } from "@/server/rateLimit";
import { check, db } from "@/server/supabase";
import { syncAfterTx } from "@/server/sync";
import { INVITE_ALPHABET, registerGroupSchema } from "@/server/validation";

// POST /api/groups/register {txHash, name}: auth. After createGroup is mined, attach a name and an
// invite code. Only the group's onchain creator (one of the caller's linked wallets) may do this.
// Calling it again renames the group and keeps the same invite code.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  const body = registerGroupSchema.parse(await readJson(request));
  await enforceRateLimit(`register:${caller.userId}`, 20, 3600, "Too many group registrations.");

  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: body.txHash, timeout: 20_000 });
  } catch {
    throw new ApiError(404, "Transaction not found (yet). Wait for it to confirm and retry.");
  }
  if (receipt.status !== "success") throw new ApiError(400, "That transaction reverted.");

  // Only trust events emitted by the escrow itself.
  const escrow = escrowAddress().toLowerCase();
  const [event] = parseEventLogs({
    abi: escrowAbi,
    eventName: "GroupCreated",
    logs: receipt.logs.filter((l) => l.address.toLowerCase() === escrow),
  });
  if (!event) throw new ApiError(400, "That transaction did not create a BYW group.");
  if (!ownsWallet(caller, event.args.creator)) throw new ApiError(403, "Only the group's creator can name it.");

  const groupId = event.args.groupId;
  const existing = (check(
    await db().from("groups").select("*").eq("id", groupId.toString()).limit(1),
    "loading group",
  ) as GroupRow[])[0];

  let saved: GroupRow | null = null;
  for (let attempt = 0; attempt < 5 && !saved; attempt++) {
    const inviteCode = existing?.invite_code ?? newInviteCode(INVITE_ALPHABET);
    const { data, error } = await db()
      .from("groups")
      .upsert(
        {
          id: groupId.toString(),
          name: body.name,
          is_public: event.args.isPublic,
          creator_wallet: event.args.creator.toLowerCase(),
          created_tx: body.txHash,
          invite_code: inviteCode,
        },
        { onConflict: "id" },
      )
      .select("*")
      .single();
    if (error?.code === "23505" && !existing?.invite_code) continue; // invite code collision: try another
    if (error) {
      console.error("[register] upsert:", error.message);
      throw new ApiError(502, "Database error while saving the group.");
    }
    saved = data as GroupRow;
  }
  if (!saved) throw new ApiError(502, "Could not allocate an invite code. Try again.");

  const syncResult = await syncAfterTx();
  return ok({
    group: { id: saved.id, name: saved.name, isPublic: saved.is_public, inviteCode: saved.invite_code },
    invitePath: `/i/${saved.invite_code}`,
    sync: syncResult,
  });
});
