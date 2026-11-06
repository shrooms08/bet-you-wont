import { Suspense } from "react";
import { CreateDareScreen } from "@/components/screens/CreateDareScreen";
import { Splash } from "@/components/ui/Splash";

// /new: create a dare (?group=<id>&text=<dare>&amount=<tokens> prefill).
export default function NewPage() {
  return (
    <Suspense fallback={<Splash />}>
      <CreateDareScreen />
    </Suspense>
  );
}
