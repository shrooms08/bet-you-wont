import { Suspense } from "react";
import { InviteOnboarding } from "@/components/onboarding/InviteOnboarding";
import { Splash } from "@/components/ui/Splash";

// /i/<code>: invite link. Onboarding with the invite preview on every step; joins after the wallet step.
export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<Splash />}>
      <InviteOnboarding params={params} />
    </Suspense>
  );
}
