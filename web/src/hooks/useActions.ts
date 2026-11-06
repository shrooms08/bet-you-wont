"use client";

import { useCallback, useState } from "react";
import { parseEventLogs, type Hex } from "viem";
import { useTxToast } from "@/components/tx/TxToast";
import { activeChain, escrowAbi, escrowAddress } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import { resizeImage } from "@/lib/image";
import type { TxState } from "@/lib/tx";
import { uploadFile } from "@/lib/upload";
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

  /** Upload file -> server checks + hashes it -> submitProof(dareId, sha256). */
  const submitProof = (dareId: number, file: File) =>
    track(`proof:${dareId}`, "posting proof", async (set) => {
      const { account, pc, escrow } = ctx();
      set({ status: "working", step: "uploading…", phase: "prepare" });
      const storagePath = await uploadFile(byw, "proof", file, file.name);
      set({ status: "working", step: "checking your file…", phase: "prepare" });
      const { proofHash } = await byw.api<{ proofHash: Hex }>("/api/proofs/finalize", { body: { dareId, storagePath } });
      const args = [BigInt(dareId), proofHash] as const;
      return byw.runTx(set, {
        simulate: () => pc.simulateContract({ account, address: escrow, abi: escrowAbi, functionName: "submitProof", args }),
        send: () => byw.writeContractAsync({ address: escrow, abi: escrowAbi, functionName: "submitProof", args, chainId: activeChain.id }),
        done: "proof is in. your crew votes now.",
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

  return { busy, accept, settle, cancel, vote, submitProof, createGroup, joinGroup, saveProfile };
}

export type Actions = ReturnType<typeof useActions>;
