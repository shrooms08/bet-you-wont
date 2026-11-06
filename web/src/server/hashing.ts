// Pure hashing helpers (no secrets, no I/O). Shared by API routes and unit tests.
import { createHash, randomBytes, randomInt } from "node:crypto";
import { encodeAbiParameters, keccak256, type Address, type Hex } from "viem";

/**
 * The dare's onchain metaHash: keccak256(abi.encode(groupId, creatorWallet, text, salt)).
 * Binding the group and creator means a draft can only ever match the dare it was written for,
 * and the random salt stops anyone from guessing short dare texts from the public hash.
 */
export function computeMetaHash(groupId: bigint, creator: Address, text: string, salt: Hex): Hex {
  return keccak256(
    encodeAbiParameters(
      [{ type: "uint256" }, { type: "address" }, { type: "string" }, { type: "bytes32" }],
      [groupId, creator, text, salt],
    ),
  );
}

/** A random 32-byte salt as 0x-prefixed hex. */
export function newSalt(): Hex {
  return `0x${randomBytes(32).toString("hex")}`;
}

/** The onchain proofHash for an uploaded file: sha256 of its exact bytes, as 0x-prefixed bytes32. */
export function proofHashOf(bytes: Uint8Array): Hex {
  return `0x${createHash("sha256").update(bytes).digest("hex")}`;
}

/** A uniformly random invite code over an unambiguous alphabet (no 0/o, 1/l/i). */
export function newInviteCode(alphabet: string, length = 10): string {
  let out = "";
  for (let i = 0; i < length; i++) out += alphabet[randomInt(alphabet.length)];
  return out;
}
