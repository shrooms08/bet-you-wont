"use client";

import { motion } from "motion/react";
import type { ReactNode } from "react";
import { fractionUsed, readout, shortLeft } from "@/lib/countdown";
import { springs } from "@/lib/motion";

const SIZE = 300;
const C = SIZE / 2;
const R = 112; // the dial
const TEXT_R = R + 22; // curved label sits just outside the edge
const CIRC = 2 * Math.PI * R;

/** Upper arc from lower-left to lower-right (clockwise), used as the textPath. */
function arcPath(r: number) {
  const a0 = (200 * Math.PI) / 180;
  const a1 = (-20 * Math.PI) / 180;
  const x0 = C + r * Math.cos(a0);
  const y0 = C - r * Math.sin(a0);
  const x1 = C + r * Math.cos(a1);
  const y1 = C - r * Math.sin(a1);
  return `M ${x0} ${y0} A ${r} ${r} 0 1 1 ${x1} ${y1}`;
}

/**
 * The ACCEPTED dial: a big dark circle with a thick border that fills lime clockwise as the
 * proof window is used up. "you've got" curves along the left, "<time> left" along the right.
 * Optional bubble (e.g. "post proof") sits on top; center holds the doer's avatar.
 */
export function CountdownCircle({ start, end, now, bubble, center }: { start: string | null; end: string | null; now: number; bubble?: ReactNode; center?: ReactNode }) {
  const used = fractionUsed(start, end, now);
  const id = "byw-arc";
  return (
    <div className="flex flex-col items-center">
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`} role="img" aria-label={`time left: ${readout(end, now).toLowerCase()}`}>
          <defs>
            <path id={id} d={arcPath(TEXT_R)} />
          </defs>
          <circle cx={C} cy={C} r={R} fill="var(--byw-inset)" stroke="var(--byw-border)" strokeWidth={16} />
          <motion.circle
            cx={C}
            cy={C}
            r={R}
            fill="none"
            stroke="var(--byw-primary)"
            strokeWidth={10}
            strokeLinecap="round"
            strokeDasharray={CIRC}
            initial={false}
            animate={{ strokeDashoffset: CIRC * (1 - used) }}
            transition={springs.smooth}
            transform={`rotate(-90 ${C} ${C})`}
          />
          <text className="font-display" fontSize="17" fill="var(--byw-text)" letterSpacing="1">
            <textPath href={`#${id}`} startOffset="6%">
              YOU&apos;VE GOT
            </textPath>
          </text>
          <text className="font-display" fontSize="17" fill="var(--byw-primary)" letterSpacing="1">
            <textPath href={`#${id}`} startOffset="94%" textAnchor="end">
              {shortLeft(end, now).toUpperCase()} LEFT
            </textPath>
          </text>
        </svg>
        <div className="absolute inset-0 grid place-items-center">{center}</div>
        {bubble && <div className="absolute left-1/2 top-[-6px] -translate-x-1/2">{bubble}</div>}
      </div>
      <p className="mt-2 font-display text-[40px] uppercase leading-none tracking-[-0.02em]" aria-hidden>
        {readout(end, now)}
      </p>
      <p className="mt-1 text-[15px] text-muted">time left</p>
    </div>
  );
}
