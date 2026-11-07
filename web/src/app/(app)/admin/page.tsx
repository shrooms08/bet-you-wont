import type { Metadata } from "next";
import { Suspense } from "react";
import { AdminScreen } from "@/components/screens/AdminScreen";
import { Splash } from "@/components/ui/Splash";

export const metadata: Metadata = { title: "Admin · Bet You Won't", robots: { index: false, follow: false } };

export default function AdminPage() {
  return (
    <Suspense fallback={<Splash />}>
      <AdminScreen />
    </Suspense>
  );
}
