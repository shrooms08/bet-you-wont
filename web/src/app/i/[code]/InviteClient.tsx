"use client";

import { useQuery } from "@tanstack/react-query";
import Link from "next/link";
import { use, useState } from "react";
import { HttpError, useByw, type PublicProfile } from "@/components/harness/useByw";
import { btn, IDLE, link, Row, Shell, TxView, Who, type TxState } from "@/components/harness/ui";
import { activeChain, escrowAbi, escrowAddress } from "@/lib/contracts";
import { describeError } from "@/lib/errors";

type Preview = { groupId: number; name: string | null; isPublic: boolean; memberCount: number; creator: PublicProfile };

export function InviteClient({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  const byw = useByw();
  const [tx, setTx] = useState<TxState>(IDLE);

  const preview = useQuery({
    queryKey: ["invite", code],
    queryFn: async () => {
      const res = await fetch(`/api/invite/${encodeURIComponent(code)}`);
      const body = (await res.json()) as Preview & { error?: string };
      if (!res.ok) throw new HttpError(res.status, body.error ?? "Invite not found");
      return body;
    },
    retry: false,
  });
  const membership = useQuery({
    queryKey: ["invite-member", preview.data?.groupId, byw.address],
    queryFn: () =>
      byw.publicClient!.readContract({
        address: escrowAddress(),
        abi: escrowAbi,
        functionName: "isMember",
        args: [BigInt(preview.data!.groupId), byw.address!],
      }),
    enabled: !!preview.data && !!byw.address && !!byw.publicClient,
  });

  async function join() {
    if (!preview.data || !byw.address || !byw.publicClient) return;
    const account = byw.address;
    const publicClient = byw.publicClient;
    const groupId = preview.data.groupId;
    try {
      setTx({ status: "working", step: "Requesting permit…" });
      const permit = await byw.api<{ deadline: string; signature: `0x${string}` }>("/api/permit", {
        body: { groupId, inviteCode: code },
      });
      const args = [BigInt(groupId), BigInt(permit.deadline), permit.signature] as const;
      await byw.runTx(setTx, {
        simulate: () => publicClient.simulateContract({ account, address: escrowAddress(), abi: escrowAbi, functionName: "joinGroup", args }),
        send: () => byw.writeContractAsync({ address: escrowAddress(), abi: escrowAbi, functionName: "joinGroup", args, chainId: activeChain.id }),
        done: `You're in ${preview.data.name ?? `group ${groupId}`}`,
      });
      void membership.refetch();
    } catch (err) {
      setTx({ status: "error", message: describeError(err) });
    }
  }

  const p = preview.data;
  return (
    <Shell>
      <section className="flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-900 p-4">
        <h2 className="font-semibold">You&apos;re invited</h2>
        {preview.isLoading && <p className="text-sm">Loading…</p>}
        {preview.error && <p className="text-sm text-red-400">{describeError(preview.error)}</p>}
        {p && (
          <>
            <Row label="Group">
              {p.name ?? `Group ${p.groupId}`} (#{p.groupId})
            </Row>
            <Row label="Members">{p.memberCount}</Row>
            <Row label="Created by">
              <Who p={p.creator} />
            </Row>
            <Row label="Type">{p.isPublic ? "public" : "private (invite only)"}</Row>
            {!byw.ready ? (
              <p className="text-sm">Loading…</p>
            ) : !byw.authenticated ? (
              <button className={btn} onClick={() => byw.login()}>
                Log in to join
              </button>
            ) : membership.data ? (
              <p className="text-sm text-green-400">✅ You&apos;re a member of this group.</p>
            ) : (
              <button className={btn} disabled={tx.status === "working" || !byw.address} onClick={() => void join()}>
                Join
              </button>
            )}
            <TxView tx={tx} />
          </>
        )}
        <Link className={`${link} text-sm`} href="/">
          Back to the app
        </Link>
      </section>
    </Shell>
  );
}
