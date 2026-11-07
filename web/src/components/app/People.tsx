"use client";

import { motion } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { useMockMode, withMock } from "@/lib/mock";
import { springs } from "@/lib/motion";

/** Wraps someone's avatar/@name so tapping it opens their profile (/u/<name>). Plain when no @name. */
export function PersonLink({ username, children, className = "" }: { username: string | null | undefined; children: ReactNode; className?: string }) {
  const mock = useMockMode();
  if (!username) return <span className={className}>{children}</span>;
  return (
    <Link href={withMock(`/u/${encodeURIComponent(username)}`, mock)} className={`rounded-full ${className}`} aria-label={`@${username}'s profile`}>
      {children}
    </Link>
  );
}

/** Small flame + streak count. Shown when streak >= `min` (2 by default). */
export function StreakFlame({ n, min = 2, size = "sm", saved = false }: { n: number | null | undefined; min?: number; size?: "sm" | "lg"; saved?: boolean }) {
  if (!n || n < min) return null;
  const px = size === "lg" ? 34 : 16;
  return (
    <motion.span
      className={`inline-flex items-center gap-1 rounded-full border-2 border-line bg-surface font-extrabold leading-none ${size === "lg" ? "px-3 py-1.5 text-[22px]" : "px-1.5 py-0.5 text-[12px]"}`}
      initial={saved ? { scale: 0.4, rotate: -20 } : false}
      animate={{ scale: 1, rotate: 0 }}
      transition={springs.bouncy}
      aria-label={`${n}-week streak`}
      title={`${n}-week streak`}
    >
      <svg width={px * 0.86} height={px} viewBox="0 0 24 28" aria-hidden>
        <path d="M12 1 C 14 7, 21 10, 20 18 C 19.5 24, 15.5 27, 12 27 C 8 27, 4 24, 4 18 C 4 13, 8 11, 9 6 C 11 9, 12 11, 12 14 C 14 12, 13.5 6, 12 1 Z" fill="var(--byw-danger)" />
        <path d="M12 15 C 14 18, 16 20, 15.5 23 C 15 25.5, 13.5 26.5, 12 26.5 C 10 26.5, 8.5 25, 8.7 22.5 C 9 20, 11 19, 12 15 Z" fill="var(--byw-primary)" />
      </svg>
      {n}
    </motion.span>
  );
}
