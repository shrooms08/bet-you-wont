import "server-only";
import { createPublicClient, fallback, http, type Address, type Transport } from "viem";
import { activeChain, escrowAbi, escrowAddress, network } from "@/lib/contracts";
import { ApiError } from "./http";
import { errLine } from "./redact";
import { serverRpcUrls } from "./rpcUrls";
import type { OnchainDare, OnchainGroup } from "./syncMap";

// Read-only chain access for the active network (no keys).
// Mainnet: QuickNode -> GetBlock -> public RPC, falling through on errors (e.g. getLogs range limits).
// The first two are server-only secrets. Testnet: the chain's public RPC.

const urls = serverRpcUrls(network, {
  MAINNET_RPC_QUICKNODE: process.env.MAINNET_RPC_QUICKNODE,
  MAINNET_RPC_GETBLOCK: process.env.MAINNET_RPC_GETBLOCK,
});

const transport: Transport = urls.length
  ? fallback(
      urls.map((u) => http(u, { retryCount: 1, retryDelay: 300, timeout: 12_000 })),
      { rank: false, retryCount: 1 },
    )
  : http(undefined, { retryCount: 3, retryDelay: 400, timeout: 20_000 });

export const publicClient = createPublicClient({ chain: activeChain, transport });

async function rpc<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[chain] ${what}:`, errLine(err));
    throw new ApiError(502, "Could not reach the chain RPC. Try again.");
  }
}

export function getGroupOnchain(groupId: bigint): Promise<OnchainGroup> {
  return rpc("getGroup", () =>
    publicClient.readContract({ address: escrowAddress(), abi: escrowAbi, functionName: "getGroup", args: [groupId] }),
  );
}

export function getDareOnchain(dareId: bigint): Promise<OnchainDare> {
  return rpc("getDare", () =>
    publicClient.readContract({ address: escrowAddress(), abi: escrowAbi, functionName: "getDare", args: [dareId] }),
  );
}

export function isMemberOnchain(groupId: bigint, account: Address): Promise<boolean> {
  return rpc("isMember", () =>
    publicClient.readContract({
      address: escrowAddress(),
      abi: escrowAbi,
      functionName: "isMember",
      args: [groupId, account],
    }),
  );
}

/** 1-based join order of `account` in the group (0 = not a member). v2: votes need it <= voterSnapshot. */
export function memberJoinIndexOnchain(groupId: bigint, account: Address): Promise<number> {
  return rpc("memberJoinIndex", () =>
    publicClient.readContract({
      address: escrowAddress(),
      abi: escrowAbi,
      functionName: "memberJoinIndex",
      args: [groupId, account],
    }),
  );
}

export function inviteSignerOnchain(): Promise<Address> {
  return rpc("inviteSigner", () =>
    publicClient.readContract({ address: escrowAddress(), abi: escrowAbi, functionName: "inviteSigner" }),
  );
}

export const groupExists = (g: OnchainGroup) => g.creator !== "0x0000000000000000000000000000000000000000";
