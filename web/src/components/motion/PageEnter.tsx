"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { springs } from "@/lib/motion";

/**
 * Route entrance: fade in and rise 12px. Wraps page content (not the fixed nav): a transformed
 * ancestor would make fixed children position against it while it animates. Motion resets the
 * transform to "none" when it settles at y 0.
 */
export function PageEnter({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <motion.div className={className} initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={springs.smooth}>
      {children}
    </motion.div>
  );
}
