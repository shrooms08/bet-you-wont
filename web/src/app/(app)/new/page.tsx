import { Suspense } from "react";
import { NewScreen } from "@/components/screens/MiscScreens";
import { Splash } from "@/components/ui/Splash";

export default function NewPage() {
  return (
    <Suspense fallback={<Splash />}>
      <NewScreen />
    </Suspense>
  );
}
