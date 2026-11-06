import { Suspense } from "react";
import { Shell } from "@/components/harness/ui";
import { InviteClient } from "./InviteClient";

// /i/<code>: invite landing page. The code is only known at request time, so the client part
// sits inside Suspense (required with cacheComponents).
export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<Shell>Loading invite…</Shell>}>
      <InviteClient params={params} />
    </Suspense>
  );
}
