"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { springs } from "@/lib/motion";
import { useMockMode, withMock } from "@/lib/mock";
import type { PublicProfile } from "@/lib/types";
import { Avatar } from "./Avatar";
import { CrewsIcon, HomeIcon, PlusIcon, ProfileIcon, WalletIcon } from "./icons";

export type NavKey = "home" | "crews" | "new" | "wallet" | "profile";

/** The lime "you are here" pill: one per nav, shared layoutId, so it glides between items. */
function ActivePill({ id }: { id: string }) {
  return <motion.span layoutId={id} className="absolute inset-0 rounded-full bg-primary" transition={springs.smooth} aria-hidden />;
}

const ITEMS: Array<{ key: NavKey; href: string; label: string; icon: (size: number) => ReactNode }> = [
  { key: "home", href: "/home", label: "home", icon: (s) => <HomeIcon size={s} /> },
  { key: "crews", href: "/crews", label: "crews", icon: (s) => <CrewsIcon size={s + 2} /> },
  { key: "new", href: "/new", label: "new dare", icon: (s) => <PlusIcon size={s + 8} /> },
  { key: "wallet", href: "/wallet", label: "wallet", icon: (s) => <WalletIcon size={s} /> },
  { key: "profile", href: "/profile", label: "profile", icon: (s) => <ProfileIcon size={s} /> },
];

/** Mobile/tablet: 5 raised pills fixed to the bottom; the center NEW DARE is a bigger circle. */
export function BottomNav({ active }: { active?: NavKey }) {
  const mock = useMockMode();
  return (
    <nav
      aria-label="main"
      className="fixed inset-x-0 bottom-0 z-40 desk:hidden"
      style={{
        paddingBottom: "calc(16px + env(safe-area-inset-bottom))",
        background: "linear-gradient(to top, var(--byw-bg) 70%, rgba(19,19,23,0))",
      }}
    >
      <ul className="mx-auto flex max-w-[560px] items-center justify-between gap-2 px-4 pt-3.5">
        {ITEMS.map((item) => {
          const on = item.key === active;
          const center = item.key === "new";
          return (
            <li key={item.key}>
              <Link
                href={withMock(item.href, mock)}
                aria-label={item.label}
                aria-current={on ? "page" : undefined}
                className={`press relative grid place-items-center border-[3px] border-line bg-surface ${
                  center ? "-mt-3 h-[68px] w-[68px] rounded-full" : "h-14 w-[62px] rounded-full"
                } ${on ? "text-on-primary" : "text-cream"}`}
              >
                {on && <ActivePill id="nav-pill-bottom" />}
                <span className="relative">{item.icon(center ? 28 : 26)}</span>
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/** Desktop (>= 1200px): the same 5 items as a vertical rail on the left. */
export function DesktopRail({ active, me, balance }: { active?: NavKey; me: PublicProfile | null; balance?: ReactNode }) {
  const mock = useMockMode();
  return (
    <aside className="sticky top-0 hidden h-dvh w-[260px] shrink-0 flex-col border-r-[3px] border-line px-6 py-8 desk:flex">
      <Link href={withMock("/home", mock)} className="mb-8 font-display text-[28px] uppercase leading-[0.9] tracking-[-0.03em]">
        <span className="block text-accent-2">bet you</span>
        <span className="block">won&apos;t.</span>
      </Link>
      <nav aria-label="main">
        <ul className="flex flex-col gap-4">
          {ITEMS.map((item) => {
            const on = item.key === active;
            const isNew = item.key === "new";
            return (
              <li key={item.key}>
                <Link
                  href={withMock(item.href, mock)}
                  aria-current={on ? "page" : undefined}
                  className={`press relative flex items-center gap-3 rounded-full border-[3px] border-line px-5 ${
                    isNew ? "min-h-16 font-display text-[19px] uppercase tracking-normal" : "min-h-[52px] text-[19px] font-extrabold"
                  } ${isNew ? "bg-primary text-on-primary" : on ? "bg-surface text-on-primary" : "bg-surface text-cream"}`}
                >
                  {on && !isNew && <ActivePill id="nav-pill-rail" />}
                  <span className="relative">{item.icon(22)}</span>
                  <span className="relative">{item.label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="mt-auto">
        {me && (
          <Link
            href={withMock("/profile", mock)}
            className="press flex items-center gap-3 rounded-full border-[3px] border-line bg-surface px-3 py-2"
          >
            <Avatar person={me} size={40} />
            <span className="min-w-0 leading-tight">
              <span className="block truncate text-[16px] font-extrabold">{me.username ? `@${me.username}` : "you"}</span>
              {balance && <span className="block truncate text-[13px] text-muted">{balance}</span>}
            </span>
          </Link>
        )}
      </div>
    </aside>
  );
}
