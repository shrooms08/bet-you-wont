"use client";

import { usePathname } from "next/navigation";
import { useBalances, useSession } from "@/hooks/data";
import { formatWif } from "@/lib/format";
import { WIF_LABEL } from "../ui/Money";
import { BottomNav, DesktopRail, type NavKey } from "../ui/Nav";

export function navKeyFor(pathname: string): NavKey | undefined {
  if (pathname.startsWith("/home")) return "home";
  if (pathname.startsWith("/crews") || pathname.startsWith("/g/")) return "crews";
  if (pathname.startsWith("/new")) return "new";
  if (pathname.startsWith("/wallet")) return "wallet";
  if (pathname.startsWith("/profile")) return "profile";
  return undefined;
}

/** The persistent nav for the (app) layout: rail on desktop, bottom bar below 1200px. */
export function AppNav({ kind }: { kind: "rail" | "bottom" }) {
  const active = navKeyFor(usePathname());
  const s = useSession();
  const balances = useBalances(s);
  if (kind === "bottom") return <BottomNav active={active} />;
  return (
    <DesktopRail
      active={active}
      me={s.onboarded || s.mock ? s.profile : null}
      balance={balances.wif !== undefined ? `${formatWif(balances.wif)} ${WIF_LABEL}` : undefined}
    />
  );
}
