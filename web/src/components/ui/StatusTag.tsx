"use client";

import { AnimatePresence, motion } from "motion/react";
import { springs } from "@/lib/motion";

export type TagKind = "OPEN" | "AIGHT BET" | "VOTING" | "PASSED" | "FAILED" | "EXPIRED" | "NO VOTES" | "CANCELLED";

// Symbol + word: status is never carried by color alone.
const TAGS: Record<TagKind, { cls: string; sym: string }> = {
  OPEN: { cls: "bg-tag-open text-tag-open-fg", sym: "○" },
  "AIGHT BET": { cls: "bg-tag-accepted text-tag-accepted-fg", sym: "✓" },
  VOTING: { cls: "bg-tag-voting text-tag-voting-fg", sym: "◐" },
  PASSED: { cls: "bg-tag-passed text-tag-passed-fg", sym: "★" },
  FAILED: { cls: "bg-tag-failed text-tag-failed-fg", sym: "✕" },
  EXPIRED: { cls: "bg-tag-expired text-tag-expired-fg", sym: "◷" },
  "NO VOTES": { cls: "bg-tag-expired text-tag-expired-fg", sym: "∅" },
  CANCELLED: { cls: "bg-tag-expired text-tag-expired-fg", sym: "⊘" },
};

/** Maps the API's state/outcome to a tag. */
export function tagFor(state: string, outcome: string): TagKind {
  if (state === "Open") return "OPEN";
  if (state === "Accepted") return "AIGHT BET";
  if (state === "Voting") return "VOTING";
  if (state === "Cancelled") return "CANCELLED";
  if (outcome === "Passed") return "PASSED";
  if (outcome === "Failed") return "FAILED";
  if (outcome === "NoVotes") return "NO VOTES";
  return "EXPIRED";
}

/** Status pill. When the status changes it flips over (rotateX) to the new one; no flip on mount. */
export function StatusTag({ kind, className = "" }: { kind: TagKind; className?: string }) {
  const t = TAGS[kind];
  return (
    <span className={`inline-grid [perspective:400px] ${className}`}>
      <AnimatePresence initial={false} mode="wait">
        <motion.span
          key={kind}
          initial={{ rotateX: -90, opacity: 0 }}
          animate={{ rotateX: 0, opacity: 1 }}
          exit={{ rotateX: 90, opacity: 0 }}
          transition={springs.snappy}
          className={`inline-flex items-center gap-1 whitespace-nowrap rounded-full border-[3px] border-line px-3 py-1 font-display text-[12px] uppercase leading-none tracking-normal ${t.cls}`}
        >
          <span aria-hidden>{t.sym}</span>
          {kind}
        </motion.span>
      </AnimatePresence>
    </span>
  );
}
