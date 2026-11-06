"use client";

import { PrivyProvider } from "@privy-io/react-auth";
import { WagmiProvider } from "@privy-io/wagmi";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState, type ReactNode } from "react";
import { TxToastProvider } from "@/components/tx/TxToast";
import { activeChain } from "@/lib/contracts";
import { wagmiConfig } from "@/lib/wagmi";

const appId = process.env.NEXT_PUBLIC_PRIVY_APP_ID;

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () => new QueryClient({ defaultOptions: { queries: { refetchOnWindowFocus: false, staleTime: 5_000 } } }),
  );

  if (!appId) {
    return <p className="p-6 text-red-400">NEXT_PUBLIC_PRIVY_APP_ID is not set. Add it to web/.env.local.</p>;
  }

  return (
    <PrivyProvider
      appId={appId}
      config={{
        loginMethods: ["email", "google", "wallet"],
        embeddedWallets: { ethereum: { createOnLogin: "users-without-wallets" } },
        defaultChain: activeChain,
        supportedChains: [activeChain],
        appearance: {
          theme: "dark",
          accentColor: "#B8DA3C",
          landingHeader: "Bet You Won't",
          loginMessage: "Log in to Bet You Won't",
          walletChainType: "ethereum-only",
        },
      }}
    >
      <QueryClientProvider client={queryClient}>
        <WagmiProvider config={wagmiConfig}>
          <TxToastProvider>{children}</TxToastProvider>
        </WagmiProvider>
      </QueryClientProvider>
    </PrivyProvider>
  );
}
