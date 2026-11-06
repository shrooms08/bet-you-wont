import { Suspense } from "react";
import { HomeScreen } from "@/components/screens/HomeScreen";
import { Splash } from "@/components/ui/Splash";

export default function HomePage() {
  return (
    <Suspense fallback={<Splash />}>
      <HomeScreen />
    </Suspense>
  );
}
