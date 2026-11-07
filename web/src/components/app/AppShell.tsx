"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useSession, useSyncLoop, type Session } from "@/hooks/data";
import { useMockMode, withMock } from "@/lib/mock";
import { PageEnter } from "../motion/PageEnter";
import { AgeModal } from "./AgeModal";
import { Skeleton } from "../ui/States";

/**
 * Content area for logged-in screens (the nav lives in app/(app)/layout.tsx so it persists).
 * - mobile/tablet: one column + fixed BottomNav (content gets .pb-nav so the nav never covers it)
 * - desktop (>= 1200): left rail, main column (max 720px), optional right column
 * Sends logged-out users to onboarding and users without an @name to the "you" step.
 * Runs the 20 s sync loop while visible.
 */
export function AppShell({
  children,
  right,
}: {
  children: (s: Session) => ReactNode;
  right?: (s: Session) => ReactNode;
}) {
  const s = useSession();
  const router = useRouter();
  const mock = useMockMode();
  useSyncLoop(s.authenticated && !s.mock);

  const needsLogin = s.ready && !s.authenticated;
  const needsProfile = s.authenticated && s.me.isSuccess && !s.me.data.profile;
  useEffect(() => {
    if (needsLogin) router.replace(withMock("/start", mock));
    else if (needsProfile) router.replace(withMock("/start?step=you", mock));
  }, [needsLogin, needsProfile, router, mock]);

  const ready = s.ready && s.authenticated && !needsProfile;

  return (
    <div className="flex min-w-0 flex-1 justify-center gap-10 px-4 tab:px-8 desk:px-10">
      <main className="pb-nav w-full min-w-0 max-w-[720px] pt-6 tab:pt-10 desk:pb-16">
        {ready ? <PageEnter>{children(s)}</PageEnter> : <Skeleton count={3} />}
      </main>
      {ready && <AgeModal s={s} />}
      {right && ready && (
        <aside className="hidden w-[320px] shrink-0 pt-10 desk:block" aria-label="side panel">
          <PageEnter className="sticky top-10 flex flex-col gap-6">{right(s)}</PageEnter>
        </aside>
      )}
    </div>
  );
}
