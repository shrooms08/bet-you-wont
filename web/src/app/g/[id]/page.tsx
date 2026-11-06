import { Suspense } from "react";
import { GroupRoute } from "@/components/screens/GroupRoute";
import { Splash } from "@/components/ui/Splash";

// /g/<id>: a crew's dare board.
export default function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Splash />}>
      <GroupRoute params={params} />
    </Suspense>
  );
}
