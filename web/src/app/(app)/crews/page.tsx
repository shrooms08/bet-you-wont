import { Suspense } from "react";
import { CrewsScreen } from "@/components/screens/CrewsScreen";
import { Splash } from "@/components/ui/Splash";

export default function CrewsPage() {
  return (
    <Suspense fallback={<Splash />}>
      <CrewsScreen />
    </Suspense>
  );
}
