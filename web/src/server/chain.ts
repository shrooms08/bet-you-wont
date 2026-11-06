import "server-only";
import { createPublicClient, http, type Address } from "viem";
import { activeChain, escrowAbi, escrowAddress } from "@/lib/contracts";
import { ApiError } from "./http";
import type { OnchainDare, OnchainGroup } from "./syncMap";

// Read-only chain access for the active network (public RPC, no keys).

export const publicClient = createPublicClient({
  chain: activeChain,
  transport: http(undefined, { retryCount: 3, retryDelay: 400, timeout: 20_000 }),
});

async function rpc<T>(what: string, fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    console.error(`[chain] ${what}:`, err instanceof Error ? err.message.split("\n")[0] : String(err));
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

export function inviteSignerOnchain(): Promise<Address> {
  return rpc("inviteSigner", () =>
    publicClient.readContract({ address: escrowAddress(), abi: escrowAbi, functionName: "inviteSigner" }),
  );
}

export const groupExists = (g: OnchainGroup) => g.creator !== "0x0000000000000000000000000000000000000000";
