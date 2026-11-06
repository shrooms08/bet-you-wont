import "server-only";
import { getAddress, type Address, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { activeChain, escrowAddress } from "@/lib/contracts";
import { inviteSignerOnchain } from "./chain";
import { serverEnv } from "./env";
import { ApiError } from "./http";

// EIP-712 JoinPermit signing with the invite signer key. Must match BYWEscrow.joinPermitDigest.

export const PERMIT_TTL_SECONDS = 10 * 60;

const JOIN_PERMIT_TYPES = {
  JoinPermit: [
    { name: "groupId", type: "uint256" },
    { name: "account", type: "address" },
    { name: "deadline", type: "uint256" },
  ],
} as const;

let signerChecked = false;

/** Confirms (once per process) that our key is the escrow's current inviteSigner. */
async function assertSignerMatches(address: Address) {
  if (signerChecked) return;
  const onchain = await inviteSignerOnchain();
  if (getAddress(onchain) !== address) {
    throw new ApiError(500, "Server misconfigured: INVITE_SIGNER_PRIVATE_KEY is not the escrow's inviteSigner.");
  }
  signerChecked = true;
}

export async function signJoinPermit(groupId: bigint, account: Address, nowMs = Date.now()) {
  const signer = privateKeyToAccount(serverEnv.inviteSignerKey());
  await assertSignerMatches(signer.address);
  const deadline = BigInt(Math.floor(nowMs / 1000) + PERMIT_TTL_SECONDS);
  const signature: Hex = await signer.signTypedData({
    domain: { name: "BYWEscrow", version: "1", chainId: activeChain.id, verifyingContract: escrowAddress() },
    types: JOIN_PERMIT_TYPES,
    primaryType: "JoinPermit",
    message: { groupId, account, deadline },
  });
  return { deadline, signature };
}
