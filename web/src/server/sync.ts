import "server-only";
import { randomUUID } from "node:crypto";
import { parseEventLogs, type Hex } from "viem";
import { escrowAbi, escrowAddress, escrowDeployBlock } from "@/lib/contracts";
import { publicClient } from "./chain";
import { ApiError, sleep } from "./http";
import { db } from "./supabase";
import {
  chunkRanges,
  collectTouched,
  dareRow,
  groupByShape,
  groupRow,
  memberRow,
  voteRow,
  type EscrowLog,
  type OnchainDare,
  type OnchainGroup,
} from "./syncMap";

/**
 * Chain -> Supabase sync.
 *
 * 1. Take the sync lease (public.sync_try_lock). One sync runs at a time across all server
 *    instances. A normal call is skipped if the last sync finished under 3 s ago.
 * 2. Read every escrow log from the cursor (re-reading a small overlap, in case an RPC node was
 *    behind last time) up to the latest block, in chunks of 5,000 blocks.
 * 3. For every group/dare those logs touch, read the authoritative struct from the contract
 *    (getGroup / getDare) and upsert it. Member joins and votes come straight from their events.
 * 4. Release the lease, advancing the cursor. On any error the lease is released without moving
 *    the cursor, so the next call retries the same range. Every write is an upsert: rerunning a
 *    range is harmless.
 */

const CHUNK_SIZE = BigInt(5_000);
const MAX_CHUNKS_PER_RUN = 40; // 200k blocks per call; a longer backlog continues on the next call
const OVERLAP_BLOCKS = BigInt(100);
const LEASE_TTL_SECONDS = 120;
const MIN_INTERVAL_SECONDS = 3;
const READ_CONCURRENCY = 4;

export type SyncResult = {
  status: "synced" | "throttled" | "busy";
  lastBlock: string;
  latestBlock?: string;
  fromBlock?: string;
  caughtUp?: boolean;
  logs?: number;
  groups?: number;
  dares?: number;
  members?: number;
  votes?: number;
  ms?: number;
};

type LockRow = { acquired: boolean; last_block: number | string; reason: string };

async function tryLock(holder: string, force: boolean, startBlock: bigint): Promise<LockRow> {
  const { data, error } = await db().rpc("sync_try_lock", {
    p_holder: holder,
    p_ttl_seconds: LEASE_TTL_SECONDS,
    p_min_interval_seconds: force ? 0 : MIN_INTERVAL_SECONDS,
    p_start_block: startBlock.toString(),
  });
  const row = (Array.isArray(data) ? data[0] : data) as LockRow | undefined;
  if (error || !row) {
    console.error("[sync] lock rpc failed:", error?.message ?? "no row");
    throw new ApiError(502, "Sync could not reach the database.");
  }
  return row;
}

async function unlock(holder: string, lastBlock: bigint | null) {
  const { error } = await db().rpc("sync_unlock", {
    p_holder: holder,
    p_last_block: lastBlock === null ? null : lastBlock.toString(),
  });
  if (error) console.error("[sync] unlock failed:", error.message);
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  async function worker() {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker));
  return out;
}

async function upsertAll(table: string, rows: Record<string, unknown>[], onConflict: string) {
  for (const batch of groupByShape(rows)) {
    for (let i = 0; i < batch.length; i += 500) {
      const { error } = await db().from(table).upsert(batch.slice(i, i + 500), { onConflict });
      if (error) throw new Error(`upsert ${table}: ${error.message}`);
    }
  }
}

/** Fetches and decodes escrow logs in [from, to]. Also returns any block timestamps the RPC included. */
async function readLogs(from: bigint, to: bigint) {
  const logs: EscrowLog[] = [];
  const blockTime = new Map<bigint, bigint>();
  for (const [a, b] of chunkRanges(from, to, CHUNK_SIZE)) {
    const raw = await publicClient.getLogs({ address: escrowAddress(), fromBlock: a, toBlock: b });
    for (const log of parseEventLogs({ abi: escrowAbi, logs: raw })) {
      if (log.blockNumber === null || log.transactionHash === null || log.logIndex === null) continue; // pending
      logs.push({
        eventName: log.eventName,
        args: log.args as Record<string, unknown>,
        blockNumber: log.blockNumber,
        transactionHash: log.transactionHash as Hex,
        logIndex: log.logIndex,
      });
      // Some RPCs include blockTimestamp on logs; this chain's sends 0, so only trust a positive value.
      const ts = (log as { blockTimestamp?: bigint | string | null }).blockTimestamp;
      if (ts !== undefined && ts !== null && BigInt(ts) > BigInt(0)) blockTime.set(log.blockNumber, BigInt(ts));
    }
  }
  return { logs, blockTime };
}

async function runSync(cursor: bigint, startBlock: bigint): Promise<Omit<SyncResult, "status">> {
  const t0 = Date.now();
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  let from = cursor + BigInt(1);
  if (cursor > startBlock) from -= OVERLAP_BLOCKS;
  if (from <= startBlock) from = startBlock + BigInt(1);
  const maxTo = from + CHUNK_SIZE * BigInt(MAX_CHUNKS_PER_RUN) - BigInt(1);
  const to = latest < maxTo ? latest : maxTo;
  if (to < from) return { lastBlock: cursor.toString(), latestBlock: latest.toString(), caughtUp: true, logs: 0 };

  const { logs, blockTime } = await readLogs(from, to);
  const touched = collectTouched(logs);

  const missing = [...touched.blocks].filter((b) => !blockTime.has(b));
  await mapLimit(missing, READ_CONCURRENCY, async (blockNumber) => {
    const block = await publicClient.getBlock({ blockNumber });
    blockTime.set(blockNumber, block.timestamp);
  });

  const groupIds = [...touched.groups.keys()];
  const dareIds = [...touched.dares.keys()];
  const groups = await mapLimit(groupIds, READ_CONCURRENCY, (id) =>
    publicClient.readContract({ address: escrowAddress(), abi: escrowAbi, functionName: "getGroup", args: [id] }),
  );
  const dares = await mapLimit(dareIds, READ_CONCURRENCY, (id) =>
    publicClient.readContract({ address: escrowAddress(), abi: escrowAbi, functionName: "getDare", args: [id] }),
  );

  // Dare text comes from the draft whose metaHash the dare committed to. The hash binds group and
  // creator, but we double-check both so a stray row can never attach text to the wrong dare.
  const texts = new Map<string, string>();
  const metaHashes = [...new Set(dares.map((d) => d.metaHash.toLowerCase()))];
  if (metaHashes.length) {
    const { data, error } = await db()
      .from("dare_drafts")
      .select("meta_hash, group_id, creator_wallet, text")
      .in("meta_hash", metaHashes);
    if (error) throw new Error(`read dare_drafts: ${error.message}`);
    for (const r of data ?? []) texts.set(`${r.meta_hash}|${r.group_id}|${r.creator_wallet}`, r.text);
  }

  const now = new Date();
  const groupRows = groupIds.map((id, i) => groupRow(id, groups[i] as OnchainGroup, touched.groups.get(id)!));
  const dareRows = dareIds.map((id, i) => {
    const d = dares[i] as OnchainDare;
    const text = texts.get(`${d.metaHash.toLowerCase()}|${d.groupId}|${d.creator.toLowerCase()}`);
    return dareRow(id, d, touched.dares.get(id)!, blockTime, text, now);
  });
  const memberRows = touched.members.map((m) => memberRow(m, blockTime));
  const voteRows = touched.votes.map((v) => voteRow(v, blockTime));

  await upsertAll("groups", groupRows, "id");
  await upsertAll("group_members", memberRows, "group_id,wallet_address");
  await upsertAll("dares", dareRows, "id");
  await upsertAll("votes", voteRows, "dare_id,voter_wallet");

  return {
    lastBlock: to.toString(),
    latestBlock: latest.toString(),
    fromBlock: from.toString(),
    caughtUp: to === latest,
    logs: logs.length,
    groups: groupRows.length,
    dares: dareRows.length,
    members: memberRows.length,
    votes: voteRows.length,
    ms: Date.now() - t0,
  };
}

/**
 * Runs one sync pass.
 * - `force`: ignore the 3-second throttle (still never runs two at once).
 * - `waitMs`: if another sync holds the lease, wait up to this long for it, then run our own pass,
 *   so the caller's just-mined transaction is guaranteed to be read.
 */
export async function sync(opts: { force?: boolean; waitMs?: number } = {}): Promise<SyncResult> {
  const startBlock = escrowDeployBlock() - BigInt(1);
  const holder = randomUUID();
  const deadline = Date.now() + (opts.waitMs ?? 0);
  for (;;) {
    const lock = await tryLock(holder, Boolean(opts.force), startBlock);
    if (lock.acquired) {
      const cursor = BigInt(lock.last_block);
      try {
        const result = await runSync(cursor, startBlock);
        await unlock(holder, BigInt(result.lastBlock));
        return { status: "synced", ...result };
      } catch (err) {
        await unlock(holder, null);
        console.error("[sync] failed:", err instanceof Error ? err.message.split("\n")[0] : String(err));
        throw new ApiError(502, "Sync failed reading the chain or writing the database. Try again.");
      }
    }
    if (lock.reason === "busy" && Date.now() < deadline) {
      await sleep(500);
      continue;
    }
    return { status: lock.reason === "busy" ? "busy" : "throttled", lastBlock: String(lock.last_block) };
  }
}

/** Sync after a user's transaction: forced, waits for a running sync. Never throws (the tx already happened). */
export async function syncAfterTx(): Promise<SyncResult | null> {
  try {
    return await sync({ force: true, waitMs: 15_000 });
  } catch {
    return null;
  }
}
