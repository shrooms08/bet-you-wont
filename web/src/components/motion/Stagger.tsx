"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { itemVariants, listVariants } from "@/lib/motion";

/** A list whose children rise 12px and fade in, 0.04s apart. Items added later animate in too. */
export function StaggerList({ children, className = "", as = "ul", ...rest }: { children: ReactNode; className?: string; as?: "ul" | "div"; "aria-label"?: string }) {
  const Tag = as === "ul" ? motion.ul : motion.div;
  return (
    <Tag className={className} variants={listVariants} initial="hidden" animate="show" {...rest}>
      {children}
    </Tag>
  );
}

export function StaggerItem({ children, className = "", as = "li" }: { children: ReactNode; className?: string; as?: "li" | "div" }) {
  const Tag = as === "li" ? motion.li : motion.div;
  return (
    <Tag className={className} variants={itemVariants}>
      {children}
    </Tag>
  );
}
