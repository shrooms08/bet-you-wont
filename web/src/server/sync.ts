import "server-only";
import { randomUUID } from "node:crypto";
import { parseEventLogs, type Hex, type Log } from "viem";
import { escrowAbi, escrowAddress, escrowDeployBlock } from "@/lib/contracts";
import { publicClient } from "./chain";
import { errLine } from "./redact";
import { ApiError, sleep } from "./http";
import { recomputeStats } from "./stats";
import { db } from "./supabase";
import {
  chunkRanges,
  collectTouched,
  dareRow,
  groupByShape,
  groupRow,
  memberRow,
  safeHead,
  splitRange,
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
 * 2. Read escrow logs from the cursor (re-reading a small overlap, in case an RPC node was behind
 *    last time) up to `latest - 3` (L-6: confirmations), one chunk at a time. A chunk the RPC
 *    refuses, or that holds too many logs, is split in half and retried (M-5).
 * 3. For every group/dare a chunk touches, read the authoritative struct from the contract
 *    (getGroup / getDare) and upsert it. Member joins and votes come straight from their events.
 *    Malformed logs or rows are skipped and logged, never fatal (M-5).
 * 4. After each chunk is written, commit the cursor to that chunk's end (public.sync_progress,
 *    which also extends the lease). The cursor never moves past a chunk that wasn't written; on
 *    any error the pass stops and the next one resumes from the last committed chunk. A pass also
 *    stops after a log budget or time budget, so a flood of events can't stall every later sync.
 *    Every write is an upsert: rerunning a range is harmless.
 */

const CHUNK_SIZE = BigInt(5_000);
const MAX_CHUNKS_PER_RUN = 40; // 200k blocks per call; a longer backlog continues on the next call
const MAX_LOGS_PER_CHUNK = 1_500; // more than this: split the range
const MAX_LOGS_PER_PASS = 3_000; // event cap per pass
const PASS_BUDGET_MS = 45_000; // well inside the 120 s lease
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
  skipped?: number;
  chunks?: number;
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

/** Commits the cursor after a written chunk and extends the lease. False if we lost the lease. */
async function progress(holder: string, lastBlock: bigint): Promise<boolean> {
  const { data, error } = await db().rpc("sync_progress", {
    p_holder: holder,
    p_last_block: lastBlock.toString(),
    p_ttl_seconds: LEASE_TTL_SECONDS,
  });
  if (error) throw new Error(`sync_progress: ${error.message}`);
  return data === true;
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

/** Raw logs for [a, b]; splits the range when the RPC refuses it or returns too many logs. */
async function readRange(a: bigint, b: bigint): Promise<{ range: [bigint, bigint]; raw: Log[] } | { split: Array<[bigint, bigint]> }> {
  try {
    const raw = await publicClient.getLogs({ address: escrowAddress(), fromBlock: a, toBlock: b });
    if (raw.length > MAX_LOGS_PER_CHUNK && b > a) return { split: splitRange([a, b]) };
    return { range: [a, b], raw };
  } catch (err) {
    if (b > a) return { split: splitRange([a, b]) };
    throw err; // a single block the RPC can't serve: stop here, the cursor stays before it
  }
}

/** Decodes, reads structs and upserts one chunk's logs. Returns what it wrote. */
async function writeChunk(raw: Log[]) {
  const logs: EscrowLog[] = [];
  const blockTime = new Map<bigint, bigint>();
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
  const touched = collectTouched(logs);
  for (const s of touched.skipped) console.error("[sync] skipped malformed log:", s);

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

  // A row that can't be mapped is skipped and logged, not fatal (M-5).
  let skipped = touched.skipped.length;
  const safe = <T,>(what: string, fn: () => T): T | null => {
    try {
      return fn();
    } catch (err) {
      skipped++;
      console.error(`[sync] skipped ${what}:`, errLine(err));
      return null;
    }
  };
  const now = new Date();
  const groupRows = groupIds
    .map((id, i) => safe(`group ${id}`, () => groupRow(id, groups[i] as OnchainGroup, touched.groups.get(id)!)))
    .filter((r) => r !== null);
  const dareRows = dareIds
    .map((id, i) =>
      safe(`dare ${id}`, () => {
        const d = dares[i] as OnchainDare;
        const text = texts.get(`${d.metaHash.toLowerCase()}|${d.groupId}|${d.creator.toLowerCase()}`);
        return dareRow(id, d, touched.dares.get(id)!, blockTime, text, now);
      }),
    )
    .filter((r) => r !== null);
  const memberRows = touched.members.map((m) => safe(`member ${m.wallet}`, () => memberRow(m, blockTime))).filter((r) => r !== null);
  const voteRows = touched.votes.map((v) => safe(`vote ${v.dareId}`, () => voteRow(v, blockTime))).filter((r) => r !== null);

  await upsertAll("groups", groupRows, "id");
  await upsertAll("group_members", memberRows, "group_id,wallet_address");
  await upsertAll("dares", dareRows, "id");
  await upsertAll("votes", voteRows, "dare_id,voter_wallet");
  return { logs: logs.length, groups: groupRows.length, dares: dareRows.length, members: memberRows.length, votes: voteRows.length, skipped };
}

async function runSync(holder: string, cursor: bigint, startBlock: bigint): Promise<Omit<SyncResult, "status">> {
  const t0 = Date.now();
  const latest = await publicClient.getBlockNumber({ cacheTime: 0 });
  const head = safeHead(latest);
  let from = cursor + BigInt(1);
  if (cursor > startBlock) from -= OVERLAP_BLOCKS;
  if (from <= startBlock) from = startBlock + BigInt(1);
  const maxTo = from + CHUNK_SIZE * BigInt(MAX_CHUNKS_PER_RUN) - BigInt(1);
  const to = head < maxTo ? head : maxTo;
  const totals = { logs: 0, groups: 0, dares: 0, members: 0, votes: 0, skipped: 0, chunks: 0 };
  if (to < from) return { lastBlock: cursor.toString(), latestBlock: latest.toString(), caughtUp: true, ...totals };

  let committed = cursor;
  const queue: Array<[bigint, bigint]> = chunkRanges(from, to, CHUNK_SIZE);
  while (queue.length) {
    if (totals.logs >= MAX_LOGS_PER_PASS || Date.now() - t0 > PASS_BUDGET_MS) break; // the next pass continues
    const [a, b] = queue.shift()!;
    const res = await readRange(a, b);
    if ("split" in res) {
      queue.unshift(...res.split);
      continue;
    }
    const wrote = await writeChunk(res.raw);
    for (const k of Object.keys(totals) as Array<keyof typeof totals>) if (k !== "chunks") totals[k] += wrote[k];
    totals.chunks++;
    // commit only past what was written; never backwards (the overlap re-reads older blocks)
    if (b > committed) {
      if (!(await progress(holder, b))) throw new Error("lost the sync lease");
      committed = b;
    }
  }

  return {
    lastBlock: committed.toString(),
    latestBlock: latest.toString(),
    fromBlock: from.toString(),
    caughtUp: committed >= head,
    ...totals,
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
        const result = await runSync(holder, cursor, startBlock);
        await unlock(holder, BigInt(result.lastBlock));
        // Dare Score / streaks: recompute when this pass wrote dares or votes.
        if ((result.dares ?? 0) > 0 || (result.votes ?? 0) > 0) {
          await recomputeStats().catch((err) => console.error("[sync] stats:", errLine(err)));
        }
        return { status: "synced", ...result };
      } catch (err) {
        // chunks written before the error are already committed (sync_progress); release only
        await unlock(holder, null);
        console.error("[sync] failed:", errLine(err));
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
