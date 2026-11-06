import { notFound } from "next/navigation";
import { Suspense } from "react";
import { HarnessPage } from "@/components/harness/HarnessPage";

// /dev: the 3c-1 test harness. Development only: a production build renders 404.
export default function DevPage() {
  if (process.env.NODE_ENV === "production") notFound();
  return (
    <Suspense fallback={null}>
      <HarnessPage />
    </Suspense>
  );
}
