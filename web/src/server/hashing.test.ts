import { describe, expect, it } from "vitest";
import { computeMetaHash, newInviteCode, newSalt, proofHashOf } from "./hashing";
import { INVITE_ALPHABET, inviteCodeSchema } from "./validation";

describe("computeMetaHash", () => {
  const creator = "0x3B031e43b2710D5D049e465A2d5675C958b659Ce" as const;
  const salt = `0x${"11".repeat(32)}` as const;

  it("matches an independently computed vector (cast abi-encode + cast keccak)", () => {
    // cast keccak $(cast abi-encode "f(uint256,address,string,bytes32)" 7 <creator> "sing at a bus stop" 0x11..11)
    expect(computeMetaHash(BigInt(7), creator, "sing at a bus stop", salt)).toBe(
      "0x97e4a1cadcdcbf74b00e6c7e5745887c3e6c8c9f9826c8a9b1892395cdf79da7",
    );
  });

  it("changes with every input", () => {
    const base = computeMetaHash(BigInt(7), creator, "sing at a bus stop", salt);
    expect(computeMetaHash(BigInt(8), creator, "sing at a bus stop", salt)).not.toBe(base);
    expect(computeMetaHash(BigInt(7), "0x43D86C35390f2B1ab9a9bDE01bAE4f2336771078", "sing at a bus stop", salt)).not.toBe(base);
    expect(computeMetaHash(BigInt(7), creator, "sing at a bus stop!", salt)).not.toBe(base);
    expect(computeMetaHash(BigInt(7), creator, "sing at a bus stop", `0x${"22".repeat(32)}`)).not.toBe(base);
  });

  it("is case-insensitive in the creator address (it is ABI-encoded as 20 bytes)", () => {
    expect(computeMetaHash(BigInt(7), creator.toLowerCase() as `0x${string}`, "x y z", salt)).toBe(
      computeMetaHash(BigInt(7), creator, "x y z", salt),
    );
  });
});

describe("newSalt", () => {
  it("returns distinct 32-byte hex values", () => {
    const a = newSalt();
    const b = newSalt();
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("proofHashOf", () => {
  it("is sha256 of the exact bytes (matches `shasum -a 256`)", () => {
    expect(proofHashOf(new TextEncoder().encode("hello"))).toBe(
      "0x2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    );
  });

  it("is a bytes32 and differs when one byte changes", () => {
    const a = proofHashOf(new Uint8Array([1, 2, 3]));
    const b = proofHashOf(new Uint8Array([1, 2, 4]));
    expect(a).toMatch(/^0x[0-9a-f]{64}$/);
    expect(a).not.toBe(b);
  });
});

describe("newInviteCode", () => {
  it("produces valid 10-char codes from the unambiguous alphabet only", () => {
    for (let i = 0; i < 200; i++) {
      const code = newInviteCode(INVITE_ALPHABET);
      expect(code).toHaveLength(10);
      expect(inviteCodeSchema.safeParse(code).success).toBe(true);
      expect(code).not.toMatch(/[01ilo]/);
    }
  });
});
