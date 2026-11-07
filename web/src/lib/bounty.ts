import { formatUnits } from "viem";

/** "20,000" for a wei amount (whole tokens). */
export function wholeTokens(wei: bigint): string {
  return Math.floor(Number(formatUnits(wei, 18))).toLocaleString("en-US");
}

/**
 * v2 public-wifie cap (BYWEscrow.publicMaxBounty): a new dare in a public wifie can lock at most
 * `cap`. Private wifies only have the global maxBounty. Mirrors the contract's PublicBountyTooHigh.
 */
export function publicCap(wei: bigint | null, isPublic: boolean, cap: bigint | null) {
  const applies = isPublic && cap !== null;
  return {
    applies,
    over: applies && wei !== null && wei > cap!,
    label: applies ? `public wifies: up to ${wholeTokens(cap!)} $wif` : null,
  };
}
