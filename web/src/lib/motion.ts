// Motion presets for the whole app. Everything animated uses these.
// Rule: only transform and opacity animate (plus the --mx/--my CSS vars for the dot spotlight).
import type { Transition } from "motion/react";

export const springs = {
  /** buttons, presses, small pops */
  snappy: { type: "spring", stiffness: 500, damping: 32 },
  /** cards, sheets, route entrances */
  smooth: { type: "spring", stiffness: 260, damping: 30 },
  /** playful: stamps, availability ticks */
  bouncy: { type: "spring", stiffness: 400, damping: 18 },
} as const satisfies Record<string, Transition>;

export const durations = {
  fast: 0.15,
  base: 0.25,
  countUp: 0.3,
  slow: 0.45,
} as const;

/** Seconds between items in a staggered list. */
export const STAGGER = 0.04;

/** Reduced motion: no springs or movement, just an instant change or a short fade. */
export const REDUCED: Transition = { type: "tween", duration: 0.15, ease: "linear" };

/** The transition to use for a preset, respecting reduced motion. */
export function pick(spring: keyof typeof springs, reduced: boolean | null): Transition {
  return reduced ? REDUCED : springs[spring];
}

/**
 * Which decorative effects run. Reduced motion switches every one of them off; the cursor and
 * spotlight also need a fine pointer (mouse/trackpad), never touch.
 */
export function fxEnabled(opts: { reducedMotion: boolean; finePointer: boolean }) {
  const motionOk = !opts.reducedMotion;
  return {
    pixelCursor: motionOk && opts.finePointer,
    spotlight: motionOk && opts.finePointer,
    particles: motionOk,
    springs: motionOk,
  };
}

/** Variants for staggered lists: parent "show" staggers children that rise 12px and fade in. */
export const listVariants = {
  hidden: {},
  show: { transition: { staggerChildren: STAGGER } },
};
export const itemVariants = {
  hidden: { opacity: 0, y: 12 },
  show: { opacity: 1, y: 0, transition: springs.smooth },
};
