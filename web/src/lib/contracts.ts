import type { Address } from "viem";
import { bywEscrowAbi } from "@/abi/BYWEscrow";
import { mockWifAbi } from "@/abi/MockWIF";
import { testnetDeployment } from "@/abi/deployments";
import { rhChain, rhChainTestnet } from "./chains";

export type NetworkName = "testnet" | "mainnet";

function readNetwork(): NetworkName {
  // NEXT_PUBLIC_* values are inlined at build time, so this must be a direct property access.
  const raw = process.env.NEXT_PUBLIC_NETWORK ?? "testnet";
  if (raw !== "testnet" && raw !== "mainnet") {
    throw new Error(`NEXT_PUBLIC_NETWORK must be "testnet" or "mainnet", got "${raw}"`);
  }
  return raw;
}

type NetworkConfig = {
  chain: typeof rhChainTestnet | typeof rhChain;
  escrow: Address | null; // null = not deployed on this network yet
  token: Address;
  tokenSymbol: string;
};

const NETWORKS: Record<NetworkName, NetworkConfig> = {
  testnet: {
    chain: rhChainTestnet,
    escrow: testnetDeployment.escrow,
    token: testnetDeployment.token,
    tokenSymbol: testnetDeployment.tokenSymbol,
  },
  mainnet: {
    chain: rhChain,
    escrow: null,
    token: "0x5173b8eA6923c2d40267890D45C46a3480954773", // real $wif
    tokenSymbol: "WIF",
  },
};

export const network: NetworkName = readNetwork();
export const activeChain = NETWORKS[network].chain;
export const tokenAddress = NETWORKS[network].token;
export const tokenSymbol = NETWORKS[network].tokenSymbol;
export const escrowAbi = bywEscrowAbi;
// The token ABI is the standard ERC20 + burn surface, identical for mWIF and $wif.
export const tokenAbi = mockWifAbi;

/** The escrow address on the active network. Throws if BYW is not deployed there yet. */
export function escrowAddress(): Address {
  const addr = NETWORKS[network].escrow;
  if (!addr) throw new Error(`BYWEscrow is not deployed on ${network} yet`);
  return addr;
}

export function explorerTx(hash: string): string {
  return `${activeChain.blockExplorers.default.url}/tx/${hash}`;
}

export function explorerAddress(address: string): string {
  return `${activeChain.blockExplorers.default.url}/address/${address}`;
}
