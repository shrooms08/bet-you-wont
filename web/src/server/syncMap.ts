// Pure mapping from decoded escrow events + onchain structs to database rows.
// sync.ts does the I/O (logs, contract reads, upserts); everything here is unit-testable.
import { zeroAddress, zeroHash, type Address, type Hex } from "viem";
import { DARE_STATES, OUTCOMES } from "./dareRules";

/** A decoded escrow log: what viem's parseEventLogs gives us, trimmed to what we use. */
export type EscrowLog = {
  eventName: string;
  args: Record<string, unknown>;
  blockNumber: bigint;
  transactionHash: Hex;
  logIndex: number;
};

export type OnchainGroup = { creator: Address; isPublic: boolean; memberCount: number; createdAt: bigint };

export type OnchainDare = {
  creator: Address;
  doDuration: number;
  voteWindow: number;
  state: number;
  outcome: number;
  target: Address;
  acceptedAt: bigint;
  doer: Address;
  proofDeadline: bigint;
  amount: bigint;
  proofAt: bigint;
  voteEnd: bigint;
  groupId: bigint;
  voterSnapshot: number;
  eligible: number;
  passVotes: number;
  failVotes: number;
  metaHash: Hex;
  proofHash: Hex;
};

export type MemberEvent = { groupId: bigint; wallet: string; joinIndex: number | null; tx: Hex; block: bigint };
export type VoteEvent = { dareId: bigint; voter: string; pass: boolean; tx: Hex; block: bigint };

export type Touched = {
  groups: Map<bigint, { createdTx?: Hex }>;
  dares: Map<
    bigint,
    { createdTx?: Hex; createdBlock?: bigint; settledTx?: Hex; settledBlock?: bigint; payout?: bigint; burned?: bigint; lastBlock?: bigint }
  >;
  members: MemberEvent[];
  votes: VoteEvent[];
  /** Blocks whose timestamps we need (member joins and every dare event). */
  blocks: Set<bigint>;
};

const lower = (a: unknown) => String(a).toLowerCase();

/** Groups the logs by the group/dare they touch. Unknown events (Paused, OwnershipTransferred...) are ignored. */
export function collectTouched(logs: EscrowLog[]): Touched {
  const t: Touched = { groups: new Map(), dares: new Map(), members: [], votes: [], blocks: new Set() };
  const group = (id: bigint) => {
    if (!t.groups.has(id)) t.groups.set(id, {});
    return t.groups.get(id)!;
  };
  const dare = (id: bigint, block?: bigint) => {
    if (!t.dares.has(id)) t.dares.set(id, {});
    const d = t.dares.get(id)!;
    // latest event block = the dare's activity time (feed ordering)
    if (block !== undefined) {
      if (d.lastBlock === undefined || block > d.lastBlock) d.lastBlock = block;
      t.blocks.add(block);
    }
    return d;
  };
  const ordered = [...logs].sort((a, b) =>
    a.blockNumber === b.blockNumber ? a.logIndex - b.logIndex : a.blockNumber < b.blockNumber ? -1 : 1,
  );
  for (const log of ordered) {
    const a = log.args;
    switch (log.eventName) {
      case "GroupCreated":
        group(a.groupId as bigint).createdTx = log.transactionHash;
        break;
      case "MemberJoined":
        group(a.groupId as bigint);
        t.members.push({
          groupId: a.groupId as bigint,
          wallet: lower(a.member),
          joinIndex: a.joinIndex === undefined ? null : Number(a.joinIndex),
          tx: log.transactionHash,
          block: log.blockNumber,
        });
        t.blocks.add(log.blockNumber);
        break;
      case "DareCreated": {
        const d = dare(a.dareId as bigint, log.blockNumber);
        d.createdTx = log.transactionHash;
        d.createdBlock = log.blockNumber;
        group(a.groupId as bigint);
        t.blocks.add(log.blockNumber);
        break;
      }
      case "DareCancelled":
      case "DareAccepted":
      case "ProofSubmitted":
        dare(a.dareId as bigint, log.blockNumber);
        break;
      case "Voted":
        dare(a.dareId as bigint, log.blockNumber);
        t.votes.push({ dareId: a.dareId as bigint, voter: lower(a.voter), pass: a.pass as boolean, tx: log.transactionHash, block: log.blockNumber });
        t.blocks.add(log.blockNumber);
        break;
      case "DareSettled": {
        const d = dare(a.dareId as bigint, log.blockNumber);
        d.settledTx = log.transactionHash;
        d.settledBlock = log.blockNumber;
        d.payout = a.payout as bigint;
        d.burned = a.burned as bigint;
        break;
      }
    }
  }
  return t;
}

const iso = (seconds: bigint) => new Date(Number(seconds) * 1000).toISOString();
const isoOrNull = (seconds: bigint) => (seconds === BigInt(0) ? null : iso(seconds));
const walletOrNull = (a: Address) => (a === zeroAddress ? null : a.toLowerCase());

export function groupRow(id: bigint, g: OnchainGroup, extra: { createdTx?: Hex }) {
  return {
    id: id.toString(),
    is_public: g.isPublic,
    creator_wallet: g.creator.toLowerCase(),
    created_at: iso(g.createdAt),
    ...(extra.createdTx ? { created_tx: extra.createdTx } : {}),
  };
}

export function memberRow(m: MemberEvent, blockTime: Map<bigint, bigint>) {
  const ts = blockTime.get(m.block);
  return {
    group_id: m.groupId.toString(),
    wallet_address: m.wallet,
    joined_at: ts === undefined ? null : iso(ts),
    join_tx: m.tx,
    ...(m.joinIndex !== null ? { join_index: m.joinIndex } : {}),
  };
}

export function voteRow(v: VoteEvent, blockTime: Map<bigint, bigint>) {
  const ts = blockTime.get(v.block);
  return {
    dare_id: v.dareId.toString(),
    voter_wallet: v.voter,
    pass: v.pass,
    tx_hash: v.tx,
    created_at: ts === undefined ? null : iso(ts),
  };
}

export type DareExtra = {
  createdTx?: Hex;
  createdBlock?: bigint;
  settledTx?: Hex;
  settledBlock?: bigint;
  lastBlock?: bigint;
  payout?: bigint;
  burned?: bigint;
};

/**
 * One `dares` row from the authoritative onchain struct plus whatever this sync window's events add.
 * Keys only appear when we know their value, so an upsert never blanks a field set by an earlier sync.
 */
export function dareRow(
  id: bigint,
  d: OnchainDare,
  extra: DareExtra,
  blockTime: Map<bigint, bigint>,
  text: string | undefined,
  now: Date,
) {
  const createdTs = extra.createdBlock === undefined ? undefined : blockTime.get(extra.createdBlock);
  const settledTs = extra.settledBlock === undefined ? undefined : blockTime.get(extra.settledBlock);
  const activityTs = extra.lastBlock === undefined ? undefined : blockTime.get(extra.lastBlock);
  return {
    id: id.toString(),
    group_id: d.groupId.toString(),
    creator_wallet: d.creator.toLowerCase(),
    target_wallet: walletOrNull(d.target),
    doer_wallet: walletOrNull(d.doer),
    amount: d.amount.toString(),
    do_duration: d.doDuration,
    vote_window: d.voteWindow,
    meta_hash: d.metaHash,
    state: DARE_STATES[d.state] ?? `Unknown(${d.state})`,
    outcome: OUTCOMES[d.outcome] ?? `Unknown(${d.outcome})`,
    accepted_at: isoOrNull(d.acceptedAt),
    proof_deadline: isoOrNull(d.proofDeadline),
    vote_end: isoOrNull(d.voteEnd),
    proof_hash: d.proofHash === zeroHash ? null : d.proofHash,
    proof_at: isoOrNull(d.proofAt),
    voter_snapshot: d.voterSnapshot,
    eligible: d.eligible,
    pass_votes: d.passVotes,
    fail_votes: d.failVotes,
    updated_at: now.toISOString(),
    ...(extra.createdTx ? { created_tx: extra.createdTx } : {}),
    ...(createdTs !== undefined ? { created_at: iso(createdTs) } : {}),
    ...(extra.settledTx ? { settled_tx: extra.settledTx } : {}),
    ...(settledTs !== undefined ? { settled_at: iso(settledTs) } : {}),
    ...(activityTs !== undefined ? { activity_at: iso(activityTs) } : {}),
    ...(extra.payout !== undefined ? { payout: extra.payout.toString() } : {}),
    ...(extra.burned !== undefined ? { burned: extra.burned.toString() } : {}),
    ...(text !== undefined ? { text } : {}),
  };
}

/** Block ranges [from, to] of at most `size` blocks. */
export function chunkRanges(from: bigint, to: bigint, size: bigint): Array<[bigint, bigint]> {
  const out: Array<[bigint, bigint]> = [];
  for (let start = from; start <= to; start += size) {
    const end = start + size - BigInt(1);
    out.push([start, end > to ? to : end]);
  }
  return out;
}

/**
 * Splits rows into batches whose objects all have the same keys. PostgREST bulk upserts use the
 * union of keys and would null out a column that is missing from some rows.
 */
export function groupByShape<T extends Record<string, unknown>>(rows: T[]): T[][] {
  const byShape = new Map<string, T[]>();
  for (const row of rows) {
    const shape = Object.keys(row).sort().join(",");
    if (!byShape.has(shape)) byShape.set(shape, []);
    byShape.get(shape)!.push(row);
  }
  return [...byShape.values()];
}
