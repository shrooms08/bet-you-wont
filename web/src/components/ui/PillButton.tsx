"use client";

import { motion, type HTMLMotionProps } from "motion/react";
import Link from "next/link";
import type { ReactNode } from "react";
import { springs } from "@/lib/motion";

export type PillVariant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<PillVariant, string> = {
  primary: "bg-primary text-on-primary",
  secondary: "bg-secondary text-on-secondary",
  ghost: "bg-surface text-cream",
  danger: "bg-danger text-on-danger",
};

// Every size is at least 44px tall (tap target).
const SIZE: Record<Size, string> = {
  sm: "min-h-11 px-4 text-[15px]",
  md: "min-h-[52px] px-6 text-[18px]",
  lg: "min-h-[60px] px-7 text-[20px]",
};

/**
 * `press-lip` swaps the 6px lip for 2px while pressed (CSS, instant); the 4px drop and the 2px
 * hover lift are motion springs (transform only).
 */
export function pillClass(variant: PillVariant = "primary", size: Size = "md", full = false) {
  return [
    "press-lip inline-flex select-none items-center justify-center gap-2 rounded-full border-[3px] border-line",
    "font-extrabold tracking-[-0.04em] leading-none whitespace-nowrap",
    "disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55",
    VARIANT[variant],
    SIZE[size],
    full ? "w-full" : "",
  ].join(" ");
}

export const pillMotion = {
  whileHover: { y: -2 },
  whileTap: { y: 4 },
  transition: springs.snappy,
} as const;

function Spinner() {
  return <span className="block h-5 w-5 animate-byw-spin rounded-full border-[3px] border-current border-t-transparent opacity-80" aria-hidden />;
}

type Common = { variant?: PillVariant; size?: Size; full?: boolean; loading?: boolean; children: ReactNode; className?: string };

/** The raised pill button. `loading` shows a spinner and blocks clicks. */
export function PillButton({
  variant = "primary",
  size = "md",
  full,
  loading,
  disabled,
  children,
  className = "",
  type = "button",
  ...rest
}: Common & Omit<HTMLMotionProps<"button">, "children">) {
  const off = disabled || loading;
  return (
    <motion.button
      type={type}
      disabled={off}
      aria-busy={loading || undefined}
      className={`${pillClass(variant, size, full)} ${className}`}
      {...(off ? {} : pillMotion)}
      {...rest}
    >
      {loading && <Spinner />}
      {children}
    </motion.button>
  );
}

const MotionLink = motion.create(Link);

/** Same look, as a link. */
export function PillLink({
  href,
  variant = "primary",
  size = "md",
  full,
  children,
  className = "",
  ...rest
}: Common & { href: string; target?: string; rel?: string; "aria-label"?: string; onClick?: () => void }) {
  return (
    <MotionLink href={href} className={`${pillClass(variant, size, full)} ${className}`} {...pillMotion} {...rest}>
      {children}
    </MotionLink>
  );
}
