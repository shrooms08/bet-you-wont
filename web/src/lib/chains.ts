import { defineChain } from "viem";

// Brand rule: UI-facing chain names use "RH Chain", never the full company name.

export const rhChainTestnet = defineChain({
  id: 46630,
  name: "RH Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

// Config only: no BYW contracts are deployed on mainnet yet.
export const rhChain = defineChain({
  id: 4663,
  name: "RH Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://robinhoodchain.blockscout.com" },
  },
});
