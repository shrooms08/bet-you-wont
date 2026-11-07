// Read-only check that Supabase matches the chain after sync.
//   cd web && set -a; source .env.local; set +a; node scripts/verify-sync.mjs
// Reads every group and dare from the escrow (getGroup/getDare/isMember) and compares them with
// the synced rows. Sends no transactions. Prints no secrets.
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { createPublicClient, http, zeroAddress, zeroHash } from "viem";

const net = process.env.NEXT_PUBLIC_NETWORK === "mainnet" ? "mainnet" : "testnet";
const deployment = JSON.parse(readFileSync(new URL(`../../contracts/deployments/${net}.json`, import.meta.url)));
console.log(`network: ${net} (public RPC)`);
const abiJson = JSON.parse(readFileSync(new URL("../../contracts/abi/BYWEscrow.json", import.meta.url)));
const abi = Array.isArray(abiJson) ? abiJson : abiJson.abi;
const escrow = deployment.contracts.BYWEscrow.address;
const client = createPublicClient({ transport: http(deployment.rpcUrl) });
const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

const STATES = ["None", "Open", "Accepted", "Voting", "Settled", "Cancelled"];
const OUTCOMES = ["None", "Passed", "Failed", "Expired"];
const read = (functionName, args = []) => client.readContract({ address: escrow, abi, functionName, args });
const lower = (a) => (a === zeroAddress ? null : a.toLowerCase());
const isoOrNull = (s) => (s === 0n ? null : new Date(Number(s) * 1000).toISOString());
const sameTime = (a, b) => (a === null || b === null ? a === b : Date.parse(a) === Date.parse(b));

let failures = 0;
const expect = (label, actual, expected) => {
  const pass = typeof expected === "function" ? expected(actual) : actual === expected;
  if (!pass) failures++;
  console.log(`${pass ? "PASS" : "FAIL"}  ${label}: ${actual}${pass || typeof expected === "function" ? "" : ` (expected ${expected})`}`);
};

const groupCount = await read("groupCount");
const dareCount = await read("dareCount");
console.log(`chain: groupCount=${groupCount} dareCount=${dareCount}`);

const { data: sync } = await db.from("sync_state").select("last_block").eq("id", 1).single();
console.log(`sync cursor: block ${sync?.last_block}`);

for (let id = 1n; id <= groupCount; id++) {
  const g = await read("getGroup", [id]);
  const { data: row } = await db.from("groups").select("*").eq("id", id.toString()).maybeSingle();
  const { data: members } = await db.from("group_members").select("wallet_address, joined_at").eq("group_id", id.toString());
  expect(`group ${id} row exists`, !!row, true);
  if (!row) continue;
  expect(`group ${id} creator`, row.creator_wallet, g.creator.toLowerCase());
  expect(`group ${id} is_public`, row.is_public, g.isPublic);
  expect(`group ${id} created_at`, sameTime(row.created_at, isoOrNull(g.createdAt)), true);
  expect(`group ${id} member rows = onchain memberCount`, members.length, g.memberCount);
  let allMembers = true;
  let joinTimesOk = true;
  for (const m of members) {
    if (!(await read("isMember", [id, m.wallet_address]))) allMembers = false;
    const joinedAt = await read("joinedAt", [id, m.wallet_address]);
    if (!sameTime(m.joined_at, isoOrNull(joinedAt))) joinTimesOk = false;
  }
  expect(`group ${id} every member row isMember onchain`, allMembers, true);
  expect(`group ${id} joined_at matches onchain joinedAt`, joinTimesOk, true);
}

for (let id = 1n; id <= dareCount; id++) {
  const d = await read("getDare", [id]);
  const { data: row } = await db
    .from("dares")
    .select("*, amount::text, payout::text, burned::text")
    .eq("id", id.toString())
    .maybeSingle();
  expect(`dare ${id} row exists`, !!row, true);
  if (!row) continue;
  expect(`dare ${id} state`, row.state, STATES[d.state]);
  expect(`dare ${id} outcome`, row.outcome, OUTCOMES[d.outcome]);
  expect(`dare ${id} amount`, row.amount, d.amount.toString());
  expect(`dare ${id} creator`, row.creator_wallet, d.creator.toLowerCase());
  expect(`dare ${id} doer`, row.doer_wallet, lower(d.doer));
  expect(`dare ${id} group`, Number(row.group_id), Number(d.groupId));
  expect(`dare ${id} meta_hash`, row.meta_hash, d.metaHash);
  expect(`dare ${id} proof_hash`, row.proof_hash, d.proofHash === zeroHash ? null : d.proofHash);
  expect(`dare ${id} tallies`, `${row.pass_votes}/${row.fail_votes}/${row.eligible}`, `${d.passVotes}/${d.failVotes}/${d.eligible}`);
  expect(`dare ${id} proof_deadline`, sameTime(row.proof_deadline, isoOrNull(d.proofDeadline)), true);
  expect(`dare ${id} created_at is a real time (not 1970)`, row.created_at, (v) => !!v && Date.parse(v) > Date.parse("2026-01-01"));
  if (OUTCOMES[d.outcome] !== "None") {
    const bps = { Passed: 500n, Failed: 1000n, Expired: 0n }[OUTCOMES[d.outcome]];
    const burned = (d.amount * bps) / 10000n;
    expect(`dare ${id} payout`, row.payout, (d.amount - burned).toString());
    expect(`dare ${id} burned`, row.burned, burned.toString());
  }
}

const { data: votes } = await db.from("votes").select("*");
for (const v of votes ?? []) {
  expect(`vote dare ${v.dare_id} by ${v.voter_wallet.slice(0, 10)} hasVoted onchain`, await read("hasVoted", [BigInt(v.dare_id), v.voter_wallet]), true);
}

console.log(failures === 0 ? "\nALL SYNC CHECKS PASSED" : `\n${failures} CHECK(S) FAILED`);
process.exit(failures === 0 ? 0 : 1);
