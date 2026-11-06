"use client";

import { motion } from "motion/react";
import { springs } from "@/lib/motion";

/**
 * Two-line uppercase headline: line 1 in an accent, line 2 in cream.
 * accent "lime" for home/crews/onboarding, "violet" for group screens and some onboarding steps.
 * On mount each line slides up from behind a mask, 0.08s apart.
 */
export function Headline({
  line1,
  line2,
  accent = "lime",
  size = "md",
  as: Tag = "h1",
}: {
  line1: string;
  line2: string;
  accent?: "lime" | "violet";
  size?: "md" | "lg" | "xl";
  as?: "h1" | "h2";
}) {
  const sizes = {
    md: "text-[40px] tab:text-[48px] desk:text-[56px]",
    lg: "text-[44px] tab:text-[56px] desk:text-[64px]",
    xl: "text-[76px]",
  };
  const lines: Array<[string, string]> = [
    [line1, accent === "lime" ? "text-accent-2" : "text-accent"],
    [line2, "text-cream"],
  ];
  return (
    <Tag className={`font-display uppercase leading-[0.92] tracking-[-0.03em] [overflow-wrap:anywhere] ${sizes[size]}`}>
      {lines.map(([text, color], i) => (
        // the mask: overflow hidden, with a little bottom room so descenders aren't clipped
        <span key={i} className="-mb-[0.08em] block overflow-hidden pb-[0.08em]">
          <motion.span
            className={`block ${color}`}
            initial={{ y: "105%" }}
            animate={{ y: 0 }}
            transition={{ ...springs.smooth, delay: i * 0.08 }}
          >
            {text}
          </motion.span>
        </span>
      ))}
    </Tag>
  );
}
