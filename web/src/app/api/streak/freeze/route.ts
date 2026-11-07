import { parseEventLogs, type TransactionReceipt } from "viem";
import { z } from "zod";
import { tokenAbi, tokenAddress } from "@/lib/contracts";
import { FREEZE_COST_WEI } from "@/lib/streak";
import { requireAdult } from "@/server/age";
import { requireCaller } from "@/server/auth";
import { publicClient } from "@/server/chain";
import { checkFreeze, FREEZE_ERRORS } from "@/server/freeze";
import { ApiError, ok, readJson, route } from "@/server/http";
import { enforceRateLimit } from "@/server/rateLimit";
import { recomputeStats, scoreSnapshot, statsFor } from "@/server/stats";
import { check, db } from "@/server/supabase";
import { txHashSchema } from "@/server/validation";

// POST /api/streak/freeze {txHash, week}: auth, 18+. After the user's wallet calls burn(2,000 $wif)
// on the token, this checks the receipt (Transfer from the token, from a linked wallet, to 0x0,
// >= 2,000) and records a freeze that makes `week` count for the streak. One per user per week.
export const POST = route(async (request: Request) => {
  const caller = await requireCaller(request);
  await requireAdult(caller);
  const body = z.object({ txHash: txHashSchema, week: z.string().regex(/^\d{4}-W\d{2}$/) }).parse(await readJson(request));
  await enforceRateLimit(`freeze:${caller.userId}`, 10, 3600, "Too many streak saves.");

  let receipt: TransactionReceipt;
  try {
    receipt = await publicClient.waitForTransactionReceipt({ hash: body.txHash, timeout: 20_000 });
  } catch {
    throw new ApiError(404, "Transaction not found (yet). Wait for it to confirm and retry.");
  }
  if (receipt.status !== "success") throw new ApiError(400, "That transaction reverted.");

  const transfers = parseEventLogs({ abi: tokenAbi, eventName: "Transfer", logs: receipt.logs }).map((l) => ({
    token: l.address,
    from: l.args.from,
    to: l.args.to,
    value: l.args.value,
  }));
  const [usedRes, frozenRes, block, scores] = await Promise.all([
    db().from("streak_freezes").select("id").eq("tx_hash", body.txHash).limit(1),
    db().from("streak_freezes").select("week").eq("privy_user_id", caller.userId),
    publicClient.getBlock({ blockNumber: receipt.blockNumber }),
    scoreSnapshot(),
  ]);
  // weeks any of this user's wallets qualified (L-4: the burn must come after the last one)
  const qualifiedWeeks = [...new Set(caller.wallets.flatMap((w) => scores.stats.get(w.toLowerCase())?.qualifiedWeeks ?? []))];
  const verdict = checkFreeze({
    transfers,
    token: tokenAddress,
    linkedWallets: caller.wallets,
    minAmount: FREEZE_COST_WEI,
    txAlreadyUsed: (check(usedRes, "checking freeze tx") as unknown[]).length > 0,
    weeksAlreadyFrozen: (check(frozenRes, "loading freezes") as Array<{ week: string }>).map((f) => f.week),
    week: body.week,
    now: Date.now(),
    burnedAt: Number(block.timestamp) * 1000,
    qualifiedWeeks,
  });
  if (verdict.result !== "ok") throw new ApiError(verdict.result === "reused-tx" || verdict.result === "already-frozen" ? 409 : 400, FREEZE_ERRORS[verdict.result]);

  const { error } = await db().from("streak_freezes").insert({
    wallet_address: verdict.from!,
    privy_user_id: caller.userId,
    week: body.week,
    tx_hash: body.txHash,
    amount: verdict.amount!.toString(),
  });
  if (error) {
    if (error.code === "23505") throw new ApiError(409, "That burn or that week was already used for a streak save.");
    console.error("[freeze] insert:", error.message);
    throw new ApiError(502, "Database error while saving your streak.");
  }
  await recomputeStats().catch(() => null);
  return ok({ saved: body.week, stats: await statsFor(verdict.from!) });
});
