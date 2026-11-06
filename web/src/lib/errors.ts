import { BaseError, ContractFunctionRevertedError, decodeErrorResult, type Hex } from "viem";
import { escrowAbi } from "./contracts";

/**
 * Turns any wallet / RPC / viem error into a short readable string.
 * Escrow custom errors are decoded by name (e.g. "AlreadyMember", "PermitExpired").
 */
export function describeError(err: unknown): string {
  if (err instanceof BaseError) {
    const reverted = err.walk((e) => e instanceof ContractFunctionRevertedError);
    if (reverted instanceof ContractFunctionRevertedError) {
      if (reverted.data?.errorName) {
        const args = reverted.data.args?.length ? `(${reverted.data.args.map(String).join(", ")})` : "";
        return `Reverted: ${reverted.data.errorName}${args}`;
      }
      if (reverted.reason) return `Reverted: ${reverted.reason}`;
    }
    if (err.walk((e) => (e as { name?: string }).name === "UserRejectedRequestError")) {
      return "You rejected the request in your wallet.";
    }
  }
  // Some wallets (incl. embedded ones) surface raw revert data inside the message.
  const message = err instanceof Error ? err.message : String(err);
  const data = message.match(/0x[0-9a-fA-F]{8}(?:[0-9a-fA-F]{64})*/g);
  for (const candidate of data ?? []) {
    try {
      const decoded = decodeErrorResult({ abi: escrowAbi, data: candidate as Hex });
      return `Reverted: ${decoded.errorName}`;
    } catch {
      // not escrow error data; keep looking
    }
  }
  return err instanceof BaseError ? err.shortMessage : message.split("\n")[0];
}
