"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useSession } from "@/hooks/data";
import { withMock } from "@/lib/mock";
import { Splash } from "../ui/Splash";

/** "/": logged out -> onboarding; logged in without an @name -> resume at "you"; else -> home. */
export function RootGate() {
  const s = useSession();
  const router = useRouter();
  useEffect(() => {
    if (s.mock) return router.replace(withMock("/home", s.mock));
    if (!s.ready) return;
    if (!s.authenticated) return router.replace("/start");
    if (s.me.isSuccess) router.replace(s.me.data.profile ? "/home" : "/start?step=you");
  }, [s.mock, s.ready, s.authenticated, s.me.isSuccess, s.me.data, router]);
  return <Splash />;
}
