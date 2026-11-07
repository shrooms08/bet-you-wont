import { describe, expect, it } from "vitest";
import { PUBLIC_MAINNET_RPC, privateRpcUrls, redactUrls, serverRpcUrls } from "./rpcUrls";

// Fake endpoints only.
const QN = "https://example-name.robinhood-mainnet.quiknode.pro/0123456789abcdef0123456789abcdef/";
const GB = "https://go.getblock.io/fedcba9876543210fedcba9876543210";

describe("serverRpcUrls", () => {
  it("mainnet: QuickNode, then GetBlock, then the public RPC", () => {
    expect(serverRpcUrls("mainnet", { MAINNET_RPC_QUICKNODE: QN, MAINNET_RPC_GETBLOCK: GB })).toEqual([QN, GB, PUBLIC_MAINNET_RPC]);
  });

  it("mainnet: skips unset, blank and non-https entries; always ends with the public RPC", () => {
    expect(serverRpcUrls("mainnet", {})).toEqual([PUBLIC_MAINNET_RPC]);
    expect(serverRpcUrls("mainnet", { MAINNET_RPC_QUICKNODE: "  ", MAINNET_RPC_GETBLOCK: GB })).toEqual([GB, PUBLIC_MAINNET_RPC]);
    expect(serverRpcUrls("mainnet", { MAINNET_RPC_QUICKNODE: "http://insecure.example" })).toEqual([PUBLIC_MAINNET_RPC]);
    expect(serverRpcUrls("mainnet", { MAINNET_RPC_QUICKNODE: PUBLIC_MAINNET_RPC })).toEqual([PUBLIC_MAINNET_RPC]);
  });

  it("testnet ignores the mainnet URLs and keeps its public RPC", () => {
    expect(serverRpcUrls("testnet", { MAINNET_RPC_QUICKNODE: QN, MAINNET_RPC_GETBLOCK: GB })).toEqual([]);
  });
});

describe("redactUrls", () => {
  const secrets = privateRpcUrls({ MAINNET_RPC_QUICKNODE: QN, MAINNET_RPC_GETBLOCK: GB });

  it("removes full URLs and their tokens from viem-style error text", () => {
    const msg = `HTTP request failed.\n\nStatus: 429\nURL: ${QN}\nRequest body: {}\nalso ${GB.replace("https://", "")} and token 0123456789abcdef0123456789abcdef`;
    const out = redactUrls(msg, secrets);
    expect(out).not.toContain("0123456789abcdef0123456789abcdef");
    expect(out).not.toContain("fedcba9876543210fedcba9876543210");
    expect(out).toContain("Status: 429");
  });

  it("never treats the public RPC as secret", () => {
    expect(privateRpcUrls({ MAINNET_RPC_QUICKNODE: PUBLIC_MAINNET_RPC })).toEqual([]);
    expect(redactUrls(`URL: ${PUBLIC_MAINNET_RPC}`, secrets)).toBe(`URL: ${PUBLIC_MAINNET_RPC}`);
  });
});
