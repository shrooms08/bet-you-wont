"use client";

import { motion, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { fx } from "@/lib/fx";
import { springs } from "@/lib/motion";
import { ScallopBadge } from "../ui/States";

export type StampOutcome = "PASSED" | "FAILED" | "EXPIRED";
const TONE = { PASSED: "passed", FAILED: "failed", EXPIRED: "expired" } as const;
const IMPACT_MS = 170; // when the bouncy spring first reaches scale 1

/**
 * The result stamp: the bottle-cap badge drops from scale 2.2 / -12deg and lands with the bouncy
 * spring; on impact the screen shakes for two frames (4px) and dot confetti bursts from it.
 * Remount (change `key`) to replay. Reduced motion: a plain fade, no shake, no confetti.
 */
export function StampSlam({ outcome, size = 176, shakeTarget }: { outcome: StampOutcome; size?: number; shakeTarget?: () => HTMLElement | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    if (reduced) return;
    const t = window.setTimeout(() => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      fx.confetti(r.left + r.width / 2, r.top + r.height / 2);
      const target = shakeTarget?.() ?? document.querySelector("main");
      // two frames (~33ms): +4px, -4px, back. Transform only.
      target?.animate([{ transform: "translate(4px, -2px)" }, { transform: "translate(-4px, 2px)" }, { transform: "none" }], {
        duration: 50,
        easing: "steps(2, end)",
      });
    }, IMPACT_MS);
    return () => window.clearTimeout(t);
  }, [reduced, shakeTarget]);

  return (
    <motion.div
      ref={ref}
      initial={reduced ? { opacity: 0 } : { scale: 2.2, rotate: -12, opacity: 0 }}
      animate={{ scale: 1, rotate: 0, opacity: 1 }}
      transition={reduced ? { duration: 0.2 } : { ...springs.bouncy, opacity: { duration: 0.08 } }}
      style={{ width: size, height: size }}
    >
      <ScallopBadge label={outcome.toLowerCase()} tone={TONE[outcome]} size={size} animate={false} />
    </motion.div>
  );
}
