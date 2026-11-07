import { defineChain } from "viem";

// Brand rule (M-10): the network is always "Robinhood Chain" in full, title case. These names are
// what the UI and Privy (and wallets adding the network) show.

export const rhChainTestnet = defineChain({
  id: 46630,
  name: "Robinhood Chain Testnet",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.testnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://explorer.testnet.chain.robinhood.com" },
  },
  testnet: true,
});

// Explorer from the Robinhood Chain network docs (docs.robinhood.com/chain/connecting).
export const rhChain = defineChain({
  id: 4663,
  name: "Robinhood Chain",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["https://rpc.mainnet.chain.robinhood.com"] },
  },
  blockExplorers: {
    default: { name: "Explorer", url: "https://robinhoodchain.blockscout.com" },
  },
});
