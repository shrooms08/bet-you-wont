import { Suspense } from "react";
import { ProfileScreen } from "@/components/screens/MiscScreens";
import { Splash } from "@/components/ui/Splash";

export default function ProfilePage() {
  return (
    <Suspense fallback={<Splash />}>
      <ProfileScreen />
    </Suspense>
  );
}
