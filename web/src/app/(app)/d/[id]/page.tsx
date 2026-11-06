import { Suspense } from "react";
import { DareRoute } from "@/components/screens/DareRoute";
import { Splash } from "@/components/ui/Splash";

// /d/<id>: one dare, every state.
export default function DarePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Splash />}>
      <DareRoute params={params} />
    </Suspense>
  );
}
