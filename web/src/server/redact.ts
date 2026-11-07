import "server-only";
import { privateRpcUrls, redactUrls } from "./rpcUrls";

// Strips the private RPC URLs (they carry API tokens) from anything we log or return.
const secrets = privateRpcUrls({
  MAINNET_RPC_QUICKNODE: process.env.MAINNET_RPC_QUICKNODE,
  MAINNET_RPC_GETBLOCK: process.env.MAINNET_RPC_GETBLOCK,
});

export function redact(message: string): string {
  return secrets.length ? redactUrls(message, secrets) : message;
}

/** First line of an error message, redacted. */
export function errLine(err: unknown): string {
  return redact(err instanceof Error ? err.message.split("\n")[0] : String(err));
}
