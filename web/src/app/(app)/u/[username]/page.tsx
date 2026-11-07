import { Suspense } from "react";
import { UserRoute } from "@/components/screens/UserRoute";
import { Splash } from "@/components/ui/Splash";

// /u/<username>: someone's profile.
export default function UserPage({ params }: { params: Promise<{ username: string }> }) {
  return (
    <Suspense fallback={<Splash />}>
      <UserRoute params={params} />
    </Suspense>
  );
}
