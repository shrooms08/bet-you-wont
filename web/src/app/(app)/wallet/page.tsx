import { Suspense } from "react";
import { WalletScreen } from "@/components/screens/MiscScreens";
import { Splash } from "@/components/ui/Splash";

export default function WalletPage() {
  return (
    <Suspense fallback={<Splash />}>
      <WalletScreen />
    </Suspense>
  );
}
