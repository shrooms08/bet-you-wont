// Server-side RPC endpoint selection and log redaction. Pure: callers pass the env in, so this file
// never reads secrets itself and is safe to unit test. The private URLs carry API tokens: they are
// only ever read in server-only modules (chain.ts, redact.ts), never NEXT_PUBLIC_.

export const PUBLIC_MAINNET_RPC = "https://rpc.mainnet.chain.robinhood.com";

export type RpcEnv = { MAINNET_RPC_QUICKNODE?: string; MAINNET_RPC_GETBLOCK?: string };

/**
 * The server's RPC URLs in fallback order. Mainnet: QuickNode, then GetBlock, then the public RPC
 * (unset or non-https entries are skipped, duplicates dropped). Testnet: [] = use the chain's public RPC.
 */
export function serverRpcUrls(network: "testnet" | "mainnet", env: RpcEnv): string[] {
  if (network !== "mainnet") return [];
  const urls = [env.MAINNET_RPC_QUICKNODE, env.MAINNET_RPC_GETBLOCK, PUBLIC_MAINNET_RPC]
    .map((u) => u?.trim() ?? "")
    .filter((u) => /^https:\/\/\S+$/.test(u));
  return [...new Set(urls)];
}

/** The private (token-bearing) URLs from the env, i.e. everything except the public RPC. */
export function privateRpcUrls(env: RpcEnv): string[] {
  return [env.MAINNET_RPC_QUICKNODE, env.MAINNET_RPC_GETBLOCK]
    .map((u) => u?.trim() ?? "")
    .filter((u) => u.length > 0 && u !== PUBLIC_MAINNET_RPC);
}

/** Replaces every private RPC URL (and its path/query tokens) in a message with "[rpc]". */
export function redactUrls(message: string, secrets: string[]): string {
  const needles = new Set<string>();
  for (const s of secrets) {
    if (!s) continue;
    needles.add(s);
    needles.add(s.replace(/\/+$/, ""));
    try {
      const u = new URL(s);
      needles.add(u.href);
      // Token-looking pieces (path segments, query values), in case a library reformats the URL.
      for (const part of [...u.pathname.split("/"), ...[...u.searchParams.values()]]) {
        if (part.length >= 12) needles.add(part);
      }
    } catch {
      // not a URL: the literal string is still redacted
    }
  }
  let out = message;
  for (const n of [...needles].filter(Boolean).sort((a, b) => b.length - a.length)) {
    out = out.split(n).join("[rpc]");
  }
  return out;
}
