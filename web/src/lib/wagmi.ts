import { createConfig } from "@privy-io/wagmi";
import type { Chain } from "viem";
import { http } from "wagmi";
import { activeChain } from "./contracts";

// Exactly one chain: the active network. Widened to `Chain` so the transports record is keyed by
// that single id (activeChain's static type is a union of testnet | mainnet).
const chain: Chain = activeChain;

// Must be createConfig from @privy-io/wagmi (not wagmi) so Privy drives the connector state.
export const wagmiConfig = createConfig({
  chains: [chain],
  transports: { [chain.id]: http() },
});
