"use client";

import { useRouter } from "next/navigation";
import { useEffect, type ReactNode } from "react";
import { useBalances, useSession, useSyncLoop, type Session } from "@/hooks/data";
import { formatWif } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { WIF_LABEL } from "../ui/Money";
import { BottomNav, DesktopRail, type NavKey } from "../ui/Nav";
import { Skeleton } from "../ui/States";

/**
 * Layout for logged-in screens.
 * - mobile/tablet: one column + fixed BottomNav (content gets .pb-nav so the nav never covers it)
 * - desktop (>= 1200): left rail, main column (max 720px), optional right column
 * Sends logged-out users to onboarding and users without an @name to the "you" step.
 * Runs the 20 s sync loop while visible.
 */
export function AppShell({
  active,
  children,
  right,
}: {
  active?: NavKey;
  children: (s: Session) => ReactNode;
  right?: (s: Session) => ReactNode;
}) {
  const s = useSession();
  const router = useRouter();
  const mock = useMockMode();
  const balances = useBalances(s);
  useSyncLoop(s.authenticated && !s.mock);

  const needsLogin = s.ready && !s.authenticated;
  const needsProfile = s.authenticated && s.me.isSuccess && !s.me.data.profile;
  useEffect(() => {
    if (needsLogin) router.replace(withMock("/start", mock));
    else if (needsProfile) router.replace(withMock("/start?step=you", mock));
  }, [needsLogin, needsProfile, router, mock]);

  const ready = s.ready && s.authenticated && !needsProfile;

  return (
    <div className="min-h-dvh desk:flex">
      <DesktopRail
        active={active}
        me={s.profile}
        balance={balances.wif !== undefined ? `${formatWif(balances.wif)} ${WIF_LABEL}` : undefined}
      />
      <div className="flex min-w-0 flex-1 justify-center gap-10 px-4 tab:px-8 desk:px-10">
        <main className="pb-nav w-full min-w-0 max-w-[720px] pt-6 tab:pt-10 desk:pb-16">
          {ready ? children(s) : <Skeleton count={3} />}
        </main>
        {right && ready && (
          <aside className="hidden w-[320px] shrink-0 pt-10 desk:block" aria-label="side panel">
            <div className="sticky top-10 flex flex-col gap-6">{right(s)}</div>
          </aside>
        )}
      </div>
      <BottomNav active={active} />
    </div>
  );
}
