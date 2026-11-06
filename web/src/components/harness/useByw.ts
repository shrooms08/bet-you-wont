"use client";

import { usePrivy, useWallets, type ConnectedWallet } from "@privy-io/react-auth";
import { useSetActiveWallet } from "@privy-io/wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useMemo } from "react";
import type { Hex } from "viem";
import { useAccount, usePublicClient, useWriteContract } from "wagmi";
import { activeChain } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import type { TxState } from "./ui";

export function chainIdOf(wallet: ConnectedWallet): number {
  return Number(wallet.chainId.split(":")[1]);
}

export class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}

/** Wallet, chain, API and tx helpers shared by every harness section. */
export function useByw() {
  const privy = usePrivy();
  const { user, authenticated, getAccessToken } = privy;
  const { wallets } = useWallets();
  const { setActiveWallet } = useSetActiveWallet();
  const { address } = useAccount();
  const publicClient = usePublicClient({ chainId: activeChain.id });
  const { writeContractAsync } = useWriteContract();
  const queryClient = useQueryClient();

  // Use the wallet linked to the Privy account: embedded for email/Google, external for wallet logins.
  const preferred = useMemo(() => {
    const primary = user?.wallet?.address?.toLowerCase();
    return (
      wallets.find((w) => w.address.toLowerCase() === primary) ??
      wallets.find((w) => w.walletClientType === "privy") ??
      wallets[0]
    );
  }, [wallets, user?.wallet?.address]);

  useEffect(() => {
    if (preferred && preferred.address.toLowerCase() !== address?.toLowerCase()) void setActiveWallet(preferred);
  }, [preferred, address, setActiveWallet]);

  const activeWallet = wallets.find((w) => w.address.toLowerCase() === address?.toLowerCase());

  const ensureChain = useCallback(async () => {
    if (!activeWallet) throw new Error("No active wallet yet. Wait a second and retry.");
    if (chainIdOf(activeWallet) !== activeChain.id) await activeWallet.switchChain(activeChain.id);
  }, [activeWallet]);

  /** Authenticated JSON call to our API, acting as the active wallet. Throws HttpError on non-2xx. */
  const api = useCallback(
    async <T>(path: string, init: { method?: string; body?: unknown } = {}): Promise<T> => {
      const token = await getAccessToken();
      if (!token) throw new Error("No Privy access token; log in again.");
      const res = await fetch(path, {
        method: init.method ?? (init.body === undefined ? "GET" : "POST"),
        headers: {
          Authorization: `Bearer ${token}`,
          ...(address ? { "X-Wallet-Address": address } : {}),
          ...(init.body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: init.body === undefined ? undefined : JSON.stringify(init.body),
      });
      const data = (await res.json().catch(() => ({}))) as T & { error?: string };
      if (!res.ok) throw new HttpError(res.status, `${path} → ${res.status}: ${data.error ?? "request failed"}`);
      return data;
    },
    [getAccessToken, address],
  );

  /** Pull new chain events into the DB, then refresh every query on the page. */
  const syncNow = useCallback(async () => {
    await fetch("/api/sync").catch(() => null);
    await queryClient.invalidateQueries();
  }, [queryClient]);

  /**
   * The standard write flow: switch chain, simulate (so reverts show the contract's error name),
   * send, wait for the receipt, then sync. `simulate` and `send` are closures so each call site
   * keeps full ABI typing.
   */
  const runTx = useCallback(
    async (
      set: (s: TxState) => void,
      steps: { simulate: () => Promise<unknown>; send: () => Promise<Hex>; done: string },
    ) => {
      if (!publicClient) throw new Error("No RPC client");
      let hash: Hex | undefined;
      try {
        set({ status: "working", step: "Checking network…" });
        await ensureChain();
        set({ status: "working", step: "Simulating…" });
        await steps.simulate();
        set({ status: "working", step: "Confirm in your wallet…" });
        hash = await steps.send();
        set({ status: "working", step: "Waiting for confirmation…", hash });
        const receipt = await publicClient.waitForTransactionReceipt({ hash });
        if (receipt.status !== "success") throw new Error("Transaction reverted");
        set({ status: "working", step: "Syncing…", hash });
        await syncNow();
        set({ status: "done", hash, message: steps.done });
        return receipt;
      } catch (err) {
        set({ status: "error", message: describeError(err), hash });
        return null;
      }
    },
    [publicClient, ensureChain, syncNow],
  );

  return { ...privy, authenticated, address, activeWallet, publicClient, writeContractAsync, ensureChain, api, syncNow, runTx };
}

export type Byw = ReturnType<typeof useByw>;

/** $wif USD price (null if unavailable). */
export function usePrice() {
  return useQuery({
    queryKey: ["price"],
    queryFn: async () => (await (await fetch("/api/price")).json()) as { usd: number | null; source: string | null },
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

// ------------------------------------------------------------------ API response shapes

export type PublicProfile = { wallet: string; username: string | null; avatarUrl: string | null; ringColor: string | null };

export type MyGroup = {
  id: number;
  name: string | null;
  isPublic: boolean;
  isCreator: boolean;
  inviteCode: string | null;
  memberCount: number;
  liveDareCount: number;
};

export type Me = { wallet: string; wallets: string[]; profile: PublicProfile | null; groups: MyGroup[] };

export type DareView = {
  id: number;
  groupId: number;
  groupName?: string | null;
  text: string | null;
  creator: PublicProfile | null;
  target: PublicProfile | null;
  doer: PublicProfile | null;
  amount: string;
  payout: string | null;
  burned: string | null;
  state: string;
  outcome: string;
  doDuration: number;
  voteWindow: number;
  proofDeadline: string | null;
  voteEnd: string | null;
  eligible: number | null;
  passVotes: number;
  failVotes: number;
  proofUrl: string | null;
  proofMime: string | null;
  createdTx: string | null;
  settledTx: string | null;
  hasVoted: boolean;
  canAccept: boolean;
  canSubmitProof: boolean;
  canVote: boolean;
  canSettle: boolean;
  canCancel: boolean;
  settleOutcome: string;
};

export type Feed = {
  viewer: string;
  group: { id: number; name: string | null; isPublic: boolean; creator: PublicProfile; inviteCode: string | null };
  members: Array<PublicProfile & { joinedAt: string | null }>;
  stats: { memberCount: number; openDares: number; liveDares: number; paidOut: string; refunded: string; burned: string };
  dares: DareView[];
};

export type Home = {
  wallet: string;
  waitingOnYou: { toAccept: DareView[]; toVote: DareView[]; needsProof: DareView[]; toSettle: DareView[] };
  groups: MyGroup[];
};

/** /api/me, shared by sections (react-query dedupes). */
export function useMe(byw: Byw) {
  return useQuery({
    queryKey: ["me", byw.address],
    queryFn: () => byw.api<Me>("/api/me"),
    enabled: byw.authenticated && !!byw.address,
  });
}
