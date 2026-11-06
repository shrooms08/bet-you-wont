import { Suspense } from "react";
import { Onboarding } from "@/components/onboarding/Onboarding";
import { Splash } from "@/components/ui/Splash";

export default function StartPage() {
  return (
    <Suspense fallback={<Splash />}>
      <Onboarding />
    </Suspense>
  );
}
