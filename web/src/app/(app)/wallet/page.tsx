import { Suspense } from "react";
import { WalletScreen } from "@/components/screens/WalletScreen";
import { Splash } from "@/components/ui/Splash";

export default function WalletPage() {
  return (
    <Suspense fallback={<Splash />}>
      <WalletScreen />
    </Suspense>
  );
}
