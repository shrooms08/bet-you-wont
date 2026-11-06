"use client";

import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { maxUint256, parseUnits, zeroAddress, type Address, type Hex } from "viem";
import { activeChain, escrowAbi, escrowAddress, explorerTx, tokenAbi, tokenAddress, tokenSymbol } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import { uploadFile } from "@/lib/upload";
import { useMe, type Byw, type DareView, type Feed, type Home } from "./useByw";
import { Amount, btn, btnGray, fmtTime, IDLE, input, link, Row, Section, TxView, Who, type TxState } from "./ui";

const DO_DURATIONS = [
  [3600, "1 hour"],
  [6 * 3600, "6 hours"],
  [24 * 3600, "24 hours"],
  [3 * 86400, "3 days"],
  [7 * 86400, "7 days"],
] as const;
const VOTE_WINDOWS = [
  [900, "15 min"],
  [3600, "1 hour"],
  [6 * 3600, "6 hours"],
  [24 * 3600, "24 hours"],
] as const;

function useFeed(byw: Byw, groupId: number | null) {
  return useQuery({
    queryKey: ["feed", groupId, byw.address],
    queryFn: () => byw.api<Feed>(`/api/groups/${groupId}/feed`),
    enabled: byw.authenticated && !!byw.address && groupId !== null,
  });
}

function GroupPicker({ byw, value, onChange }: { byw: Byw; value: number | null; onChange: (id: number | null) => void }) {
  const me = useMe(byw);
  return (
    <select className={input} value={value ?? ""} onChange={(e) => onChange(e.target.value ? Number(e.target.value) : null)}>
      <option value="">pick a group…</option>
      {me.data?.groups.map((g) => (
        <option key={g.id} value={g.id}>
          #{g.id} {g.name ?? "(unnamed)"} · {g.memberCount} members · {g.liveDareCount} live
        </option>
      ))}
    </select>
  );
}

export function CreateDareSection({ byw }: { byw: Byw }) {
  const [groupId, setGroupId] = useState<number | null>(null);
  const feed = useFeed(byw, groupId);
  const [text, setText] = useState("");
  const [target, setTarget] = useState<string>("");
  const [amount, setAmount] = useState("100");
  const [doDuration, setDoDuration] = useState<number>(86400);
  const [voteWindow, setVoteWindow] = useState<number>(3600);
  const [tx, setTx] = useState<TxState>(IDLE);

  // Prefill from /dev?group=<id>&text=<dare> (the app's /new placeholder links here).
  useEffect(() => {
    const q = new URLSearchParams(window.location.search);
    const g = Number(q.get("group"));
    const t = q.get("text");
    // eslint-disable-next-line react-hooks/set-state-in-effect -- one-time read of the URL on mount
    if (g > 0) setGroupId(g);
    if (t) setText(t.slice(0, 140));
  }, []);

  async function create() {
    if (!byw.address || !byw.publicClient || groupId === null) return;
    const account = byw.address;
    const publicClient = byw.publicClient;
    let wei: bigint;
    try {
      wei = parseUnits(amount, 18);
    } catch {
      setTx({ status: "error", message: "Amount must be a number." });
      return;
    }
    try {
      setTx({ status: "working", step: "Saving dare text…" });
      const { metaHash } = await byw.api<{ metaHash: Hex }>("/api/dares/draft", { body: { groupId, text } });

      const escrow = escrowAddress();
      const allowance = await publicClient.readContract({
        address: tokenAddress,
        abi: tokenAbi,
        functionName: "allowance",
        args: [account, escrow],
      });
      if (allowance < wei) {
        const approved = await byw.runTx(setTx, {
          simulate: () =>
            publicClient.simulateContract({ account, address: tokenAddress, abi: tokenAbi, functionName: "approve", args: [escrow, maxUint256] }),
          send: () =>
            byw.writeContractAsync({ address: tokenAddress, abi: tokenAbi, functionName: "approve", args: [escrow, maxUint256], chainId: activeChain.id }),
          done: `Approved ${tokenSymbol} (one time)`,
        });
        if (!approved) return;
      }

      const args = [BigInt(groupId), (target || zeroAddress) as Address, wei, doDuration, voteWindow, metaHash] as const;
      const receipt = await byw.runTx(setTx, {
        simulate: () => publicClient.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: "createDare", args }),
        send: () => byw.writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "createDare", args, chainId: activeChain.id }),
        done: "Dare created",
      });
      if (receipt) setText("");
    } catch (err) {
      setTx({ status: "error", message: describeError(err) });
    }
  }

  const others = feed.data?.members.filter((m) => m.wallet !== byw.address?.toLowerCase()) ?? [];
  return (
    <Section title="5. Create a dare">
      <span id="create" />
      <GroupPicker byw={byw} value={groupId} onChange={setGroupId} />
      <textarea
        className={input}
        rows={2}
        maxLength={140}
        placeholder="I dare you to… (3-140 chars)"
        value={text}
        onChange={(e) => setText(e.target.value)}
      />
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <label>
          who{" "}
          <select className={input} value={target} onChange={(e) => setTarget(e.target.value)}>
            <option value="">anyone in the group</option>
            {others.map((m) => (
              <option key={m.wallet} value={m.wallet}>
                {m.username ? `@${m.username}` : m.wallet}
              </option>
            ))}
          </select>
        </label>
        <label>
          bounty{" "}
          <input className={`${input} w-24`} inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.trim())} />{" "}
          {tokenSymbol}
        </label>
        <label>
          time to do it{" "}
          <select className={input} value={doDuration} onChange={(e) => setDoDuration(Number(e.target.value))}>
            {DO_DURATIONS.map(([s, l]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
          </select>
        </label>
        <label>
          vote window{" "}
          <select className={input} value={voteWindow} onChange={(e) => setVoteWindow(Number(e.target.value))}>
            {VOTE_WINDOWS.map(([s, l]) => (
              <option key={s} value={s}>
                {l}
              </option>
            ))}
          </select>
        </label>
      </div>
      <p className="text-sm text-neutral-400">
        Bounty: <Amount wei={(() => { try { return parseUnits(amount || "0", 18); } catch { return null; } })()} />
      </p>
      <button className={btn} disabled={groupId === null || text.trim().length < 3 || tx.status === "working"} onClick={() => void create()}>
        Create dare
      </button>
      <TxView tx={tx} />
    </Section>
  );
}

export function DareCard({ byw, dare }: { byw: Byw; dare: DareView }) {
  const [tx, setTx] = useState<TxState>(IDLE);
  const [file, setFile] = useState<File | null>(null);
  const busy = tx.status === "working";
  const id = BigInt(dare.id);

  function write(functionName: "acceptDare" | "settle" | "cancelDare", done: string) {
    if (!byw.address || !byw.publicClient) return;
    const account = byw.address;
    const publicClient = byw.publicClient;
    void byw.runTx(setTx, {
      simulate: () => publicClient.simulateContract({ account, address: escrowAddress(), abi: escrowAbi, functionName, args: [id] }),
      send: () => byw.writeContractAsync({ address: escrowAddress(), abi: escrowAbi, functionName, args: [id], chainId: activeChain.id }),
      done,
    });
  }

  function vote(pass: boolean) {
    if (!byw.address || !byw.publicClient) return;
    const account = byw.address;
    const publicClient = byw.publicClient;
    const args = [id, pass] as const;
    void byw.runTx(setTx, {
      simulate: () => publicClient.simulateContract({ account, address: escrowAddress(), abi: escrowAbi, functionName: "vote", args }),
      send: () => byw.writeContractAsync({ address: escrowAddress(), abi: escrowAbi, functionName: "vote", args, chainId: activeChain.id }),
      done: `Voted ${pass ? "pass" : "fail"}`,
    });
  }

  async function submitProof() {
    if (!file || !byw.address || !byw.publicClient) return;
    const account = byw.address;
    const publicClient = byw.publicClient;
    try {
      setTx({ status: "working", step: "Uploading proof…" });
      const storagePath = await uploadFile(byw, "proof", file);
      setTx({ status: "working", step: "Hashing proof on the server…" });
      // 3c-2b-1: finalize needs a capture session; the harness sends a JPEG as a "photo"
      const ses = await byw.api<{ sessionId: string }>("/api/proofs/session", { body: { dareId: dare.id } });
      const { proofHash } = await byw.api<{ proofHash: Hex }>("/api/proofs/finalize", {
        body: { dareId: dare.id, storagePath, sessionId: ses.sessionId, kind: "photo", capturedAt: new Date().toISOString() },
      });
      const args = [id, proofHash] as const;
      await byw.runTx(setTx, {
        simulate: () => publicClient.simulateContract({ account, address: escrowAddress(), abi: escrowAbi, functionName: "submitProof", args }),
        send: () => byw.writeContractAsync({ address: escrowAddress(), abi: escrowAbi, functionName: "submitProof", args, chainId: activeChain.id }),
        done: "Proof posted: voting is open",
      });
    } catch (err) {
      setTx({ status: "error", message: describeError(err) });
    }
  }

  return (
    <div className="flex flex-col gap-1 rounded border border-neutral-800 p-3">
      <p className="font-medium">
        #{dare.id}
        {dare.groupName !== undefined && <span className="text-neutral-500"> in {dare.groupName ?? `group ${dare.groupId}`}</span>}:{" "}
        {dare.text ?? <span className="text-neutral-500">(no text)</span>}
      </p>
      <Row label="State">
        {dare.state}
        {dare.outcome !== "None" && ` · ${dare.outcome}`}
      </Row>
      <Row label="Bounty">
        <Amount wei={dare.amount} />
      </Row>
      <Row label="From → to">
        <Who p={dare.creator} /> → <Who p={dare.target} />
        {dare.doer && (
          <>
            {" "}· doer <Who p={dare.doer} />
          </>
        )}
      </Row>
      {dare.proofDeadline && <Row label="Proof due">{fmtTime(dare.proofDeadline)}</Row>}
      {dare.voteEnd && (
        <Row label="Votes">
          {dare.passVotes} pass / {dare.failVotes} fail of {dare.eligible} eligible · ends {fmtTime(dare.voteEnd)}
          {dare.hasVoted && " · you voted"}
        </Row>
      )}
      {dare.payout && (
        <Row label="Settled">
          paid <Amount wei={dare.payout} />, burned <Amount wei={dare.burned} />
        </Row>
      )}
      {dare.proofUrl &&
        (dare.proofMime?.startsWith("video/") ? (
          <video src={dare.proofUrl} controls className="max-h-64 rounded" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- harness page; proof media comes from Supabase storage
          <img src={dare.proofUrl} alt="proof" className="max-h-64 rounded object-contain" />
        ))}
      <div className="flex flex-wrap gap-2">
        {dare.canAccept && (
          <button className={btn} disabled={busy} onClick={() => write("acceptDare", "Aight bet: accepted")}>
            Aight bet
          </button>
        )}
        {dare.canSubmitProof && (
          <>
            <input
              type="file"
              accept="image/jpeg"
              className="text-sm"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
            <button className={btn} disabled={busy || !file} onClick={() => void submitProof()}>
              Upload proof
            </button>
          </>
        )}
        {dare.canVote && (
          <>
            <button className={btn} disabled={busy} onClick={() => vote(true)}>
              Vote pass
            </button>
            <button className={btnGray} disabled={busy} onClick={() => vote(false)}>
              Vote fail
            </button>
          </>
        )}
        {dare.canSettle && (
          <button className={btn} disabled={busy} onClick={() => write("settle", "Settled")}>
            Settle ({dare.settleOutcome})
          </button>
        )}
        {dare.canCancel && (
          <button className={btnGray} disabled={busy} onClick={() => write("cancelDare", "Cancelled and refunded")}>
            Cancel
          </button>
        )}
        {dare.createdTx && (
          <a className={`${link} text-xs`} href={explorerTx(dare.createdTx)} target="_blank" rel="noreferrer">
            created tx
          </a>
        )}
        {dare.settledTx && (
          <a className={`${link} text-xs`} href={explorerTx(dare.settledTx)} target="_blank" rel="noreferrer">
            settled tx
          </a>
        )}
      </div>
      <TxView tx={tx} />
    </div>
  );
}

export function FeedSection({ byw }: { byw: Byw }) {
  const [groupId, setGroupId] = useState<number | null>(null);
  const feed = useFeed(byw, groupId);
  const f = feed.data;
  return (
    <Section title="6. Group feed">
      <div className="flex gap-2">
        <GroupPicker byw={byw} value={groupId} onChange={setGroupId} />
        <button className={btnGray} disabled={groupId === null} onClick={() => void byw.syncNow()}>
          Sync + refresh
        </button>
      </div>
      {feed.isLoading && <p className="text-sm">Loading…</p>}
      {feed.error && <p className="text-sm text-red-400">{describeError(feed.error)}</p>}
      {f && (
        <>
          <Row label="Group">
            #{f.group.id} {f.group.name ?? "(unnamed)"} · {f.group.isPublic ? "public" : "private"} · by <Who p={f.group.creator} />
          </Row>
          {f.group.inviteCode && (
            <Row label="Invite">
              <a className={link} href={`/i/${f.group.inviteCode}`}>
                /i/{f.group.inviteCode}
              </a>
            </Row>
          )}
          <Row label="Members">
            <span className="flex flex-wrap gap-2">
              {f.members.map((m) => (
                <Who key={m.wallet} p={m} />
              ))}
            </span>
          </Row>
          <Row label="Stats">
            {f.stats.openDares} open · {f.stats.liveDares} live · paid out <Amount wei={f.stats.paidOut} /> · burned{" "}
            <Amount wei={f.stats.burned} />
          </Row>
          {f.dares.length === 0 && <p className="text-sm text-neutral-500">No dares yet.</p>}
          {f.dares.map((d) => (
            <DareCard key={d.id} byw={byw} dare={d} />
          ))}
        </>
      )}
    </Section>
  );
}

export function HomeSection({ byw }: { byw: Byw }) {
  const home = useQuery({
    queryKey: ["home", byw.address],
    queryFn: () => byw.api<Home>("/api/home"),
    enabled: byw.authenticated && !!byw.address,
    refetchInterval: 30_000,
  });
  const w = home.data?.waitingOnYou;
  const buckets: Array<[string, DareView[] | undefined]> = [
    ["Dares you can accept", w?.toAccept],
    ["Waiting for your vote", w?.toVote],
    ["Your dares needing proof", w?.needsProof],
    ["Ready to settle (anyone can)", w?.toSettle],
  ];
  return (
    <Section title="7. Waiting on you">
      {home.isLoading && <p className="text-sm">Loading…</p>}
      {home.error && <p className="text-sm text-red-400">{describeError(home.error)}</p>}
      {w &&
        buckets.map(([title, list]) => (
          <div key={title} className="flex flex-col gap-2">
            <h3 className="text-sm font-semibold text-neutral-300">
              {title} ({list?.length ?? 0})
            </h3>
            {list?.map((d) => (
              <DareCard key={`${title}-${d.id}`} byw={byw} dare={d} />
            ))}
          </div>
        ))}
    </Section>
  );
}
