"use client";

import { useCallback, useState } from "react";
import { maxUint256, parseEventLogs, type Address, type Hex } from "viem";
import { useTxToast } from "@/components/tx/TxToast";
import { activeChain, escrowAbi, escrowAddress, tokenAbi, tokenAddress } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import { resizeImage } from "@/lib/image";
import type { TxState } from "@/lib/tx";
import type { ProofSession } from "@/lib/types";
import { uploadFile, uploadWithProgress } from "@/lib/upload";
import type { Session } from "./data";

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Every user action, built on the harness's proven flows (useByw.runTx: switch chain, simulate,
 * send, wait, /api/sync). Progress goes to the global TxToast; `busy` names the running action so
 * buttons can show a spinner. In ?mock mode actions only play the toast states.
 */
export function useActions(s: Session) {
  const toast = useTxToast();
  const { byw } = s;
  const [busy, setBusy] = useState<string | null>(null);

  const track = useCallback(
    async <T>(
      key: string,
      title: string,
      fn: (set: (t: TxState) => void) => Promise<T | null>,
      mockResult: T | null = null,
    ): Promise<T | null> => {
      setBusy(key);
      const set = (t: TxState) => toast.show(title, t);
      try {
        if (s.mock) {
          set({ status: "working", step: "", phase: "confirm" });
          await sleep(700);
          set({ status: "working", step: "", phase: "sending" });
          await sleep(700);
          set({ status: "done", message: "mock mode: nothing was sent" });
          return mockResult;
        }
        return await fn(set);
      } catch (err) {
        set({ status: "error", message: describeError(err) });
        return null;
      } finally {
        setBusy(null);
      }
    },
    [toast, s.mock],
  );

  const ctx = () => {
    if (!byw.address || !byw.publicClient) throw new Error("Your wallet is still connecting. Try again in a second.");
    return { account: byw.address, pc: byw.publicClient, escrow: escrowAddress() };
  };

  /** acceptDare / settle / cancelDare: one-arg escrow calls. */
  const simple = (fn: "acceptDare" | "settle" | "cancelDare", title: string, done: string) => (dareId: number) =>
    track(`${fn}:${dareId}`, title, async (set) => {
      const { account, pc, escrow } = ctx();
      const args = [BigInt(dareId)] as const;
      return byw.runTx(set, {
        simulate: () => pc.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: fn, args }),
        send: () => byw.writeContractAsync({ address: escrow, abi: escrowAbi, functionName: fn, args, chainId: activeChain.id }),
        done,
      });
    });

  const accept = simple("acceptDare", "aight bet", "you're on. post proof before time runs out.");
  const settle = simple("settle", "settling", "settled. payout sent.");
  const cancel = simple("cancelDare", "cancelling", "cancelled. your $wif is back.");

  const vote = (dareId: number, pass: boolean) =>
    track(`vote:${dareId}`, pass ? "it counts" : "nah", async (set) => {
      const { account, pc, escrow } = ctx();
      const args = [BigInt(dareId), pass] as const;
      return byw.runTx(set, {
        simulate: () => pc.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: "vote", args }),
        send: () => byw.writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "vote", args, chainId: activeChain.id }),
        done: "vote in.",
      });
    });

  /** createGroup onchain, then name it + get an invite code (/api/groups/register). */
  const createGroup = (name: string, isPublic = false) =>
    track("createGroup", "starting your crew", async (set) => {
      const { account, pc, escrow } = ctx();
      const receipt = await byw.runTx(set, {
        simulate: () => pc.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: "createGroup", args: [isPublic] }),
        send: () => byw.writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "createGroup", args: [isPublic], chainId: activeChain.id }),
        done: "crew created.",
      });
      if (!receipt) return null;
      const [event] = parseEventLogs({ abi: escrowAbi, eventName: "GroupCreated", logs: receipt.logs });
      set({ status: "working", step: "naming your crew…", phase: "sending", hash: receipt.transactionHash });
      const res = await byw.api<{ invitePath: string; group: { id: number } }>("/api/groups/register", {
        body: { txHash: receipt.transactionHash, name },
      });
      await byw.syncNow();
      set({ status: "done", hash: receipt.transactionHash, message: `${name} is live. invite your friends.` });
      return { groupId: Number(event?.args.groupId ?? res.group.id), invitePath: res.invitePath };
    }, { groupId: 7, invitePath: "/i/k7m2p9xq4h" });

  /** Server-signed permit (public group, or private with invite code) -> joinGroup. */
  const joinGroup = (groupId: number, inviteCode?: string) =>
    track(`join:${groupId}`, "joining", async (set) => {
      const { account, pc, escrow } = ctx();
      set({ status: "working", step: "getting your invite…", phase: "prepare" });
      const permit = await byw.api<{ deadline: string; signature: Hex }>("/api/permit", {
        body: { groupId, ...(inviteCode ? { inviteCode } : {}) },
      });
      const args = [BigInt(groupId), BigInt(permit.deadline), permit.signature] as const;
      const receipt = await byw.runTx(set, {
        simulate: () => pc.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: "joinGroup", args }),
        send: () => byw.writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "joinGroup", args, chainId: activeChain.id }),
        done: "you're in.",
      });
      return receipt ? true : null;
    }, true);

  /** Optional avatar (resized to 512px JPEG) + @name -> /api/profile. Not a transaction. */
  const saveProfile = (username: string, avatar: File | null) =>
    track("profile", "saving you", async (set) => {
      let avatarPath: string | undefined;
      if (avatar) {
        set({ status: "working", step: "uploading your photo…", phase: "prepare" });
        const small = await resizeImage(avatar, 512);
        avatarPath = await uploadFile(byw, "avatar", small);
      }
      set({ status: "working", step: "saving…", phase: "prepare" });
      await byw.api("/api/profile", { body: { username, avatarPath } });
      await byw.syncNow();
      set({ status: "done", message: `hey @${username}.` });
      return true;
    }, true);

  /** draft -> approve $wif if the allowance is short -> createDare. Returns the new dare id. */
  const createDare = (
    p: { groupId: number; text: string; target: Address | null; wei: bigint; doDuration: number; voteWindow: number },
    onStep?: (step: "draft" | "approve" | "send") => void,
  ) =>
    track(
      "createDare",
      "sending your dare",
      async (set) => {
        const { account, pc, escrow } = ctx();
        onStep?.("draft");
        set({ status: "working", step: "saving your dare…", phase: "prepare" });
        const { metaHash } = await byw.api<{ metaHash: Hex }>("/api/dares/draft", { body: { groupId: p.groupId, text: p.text } });
        const allowance = await pc.readContract({ address: tokenAddress, abi: tokenAbi, functionName: "allowance", args: [account, escrow] });
        if (allowance < p.wei) {
          onStep?.("approve");
          const approved = await byw.runTx(set, {
            simulate: () => pc.simulateContract({ account, address: tokenAddress, abi: tokenAbi, functionName: "approve", args: [escrow, maxUint256] }),
            send: () => byw.writeContractAsync({ address: tokenAddress, abi: tokenAbi, functionName: "approve", args: [escrow, maxUint256], chainId: activeChain.id }),
            done: "$wif approved (one time).",
          });
          if (!approved) return null;
        }
        onStep?.("send");
        const args = [BigInt(p.groupId), p.target ?? ("0x0000000000000000000000000000000000000000" as Address), p.wei, p.doDuration, p.voteWindow, metaHash] as const;
        const receipt = await byw.runTx(set, {
          simulate: () => pc.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: "createDare", args }),
          send: () => byw.writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "createDare", args, chainId: activeChain.id }),
          done: "dare sent. bet they won't.",
        });
        if (!receipt) return null;
        const [ev] = parseEventLogs({ abi: escrowAbi, eventName: "DareCreated", logs: receipt.logs });
        return ev ? Number(ev.args.dareId) : null;
      },
      42,
    );

  /** A 15-minute capture session; its code is burned into the capture. Not a transaction. */
  const startProofSession = async (dareId: number): Promise<ProofSession> => {
    if (s.mock) {
      const now = Date.now();
      return { sessionId: "00000000-0000-4000-8000-000000000000", code: "K7M2PQ", issuedAt: new Date(now).toISOString(), expiresAt: new Date(now + 900_000).toISOString() };
    }
    return byw.api<ProofSession>("/api/proofs/session", { body: { dareId } });
  };

  /** Upload a live capture (+ poster for videos) -> finalize with the session -> submitProof onchain. */
  const submitCapture = (
    dareId: number,
    c: { blob: Blob; mime: string; kind: "photo" | "video"; poster: Blob | null; durationMs: number | null; capturedAt: string },
    session: ProofSession,
    onProgress?: (f: number) => void,
  ) =>
    track(
      `proof:${dareId}`,
      "posting proof",
      async (set) => {
        const { account, pc, escrow } = ctx();
        set({ status: "working", step: "uploading…", phase: "prepare" });
        const storagePath = await uploadWithProgress(byw, "proof", c.blob, c.mime, (f) => onProgress?.(f * (c.poster ? 0.9 : 1)));
        let posterPath: string | undefined;
        if (c.poster) {
          posterPath = await uploadWithProgress(byw, "proof", c.poster, "image/jpeg", (f) => onProgress?.(0.9 + f * 0.1));
        }
        set({ status: "working", step: "checking your proof…", phase: "prepare" });
        const { proofHash } = await byw.api<{ proofHash: Hex }>("/api/proofs/finalize", {
          body: {
            dareId,
            storagePath,
            sessionId: session.sessionId,
            kind: c.kind,
            capturedAt: c.capturedAt,
            ...(c.durationMs !== null ? { durationMs: Math.round(c.durationMs) } : {}),
            ...(posterPath ? { posterPath } : {}),
          },
        });
        const args = [BigInt(dareId), proofHash] as const;
        return byw.runTx(set, {
          simulate: () => pc.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: "submitProof", args }),
          send: () => byw.writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "submitProof", args, chainId: activeChain.id }),
          done: "proof is in. your crew votes now.",
        });
      },
    );

  return { busy, accept, settle, cancel, vote, createGroup, joinGroup, saveProfile, createDare, startProofSession, submitCapture };
}

export type Actions = ReturnType<typeof useActions>;
