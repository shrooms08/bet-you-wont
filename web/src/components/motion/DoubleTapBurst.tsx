"use client";

import { AnimatePresence, motion } from "motion/react";
import { useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { fx } from "@/lib/fx";

type Pop = { id: number; x: number; y: number };
const DOUBLE_MS = 300;
const DOUBLE_PX = 30;

/**
 * Wraps media: a double tap/click shows a big 🔥 (scale 0.4 -> 1.2 -> 1, then floats up and fades),
 * sprays 6 small 🔥 particles, and calls onReact. Detected from pointerdown pairs, so it works the
 * same for mouse, pen and touch (touch-action: manipulation stops double-tap-to-zoom).
 */
export function DoubleTapBurst({ children, onReact, emoji = "🔥", className = "" }: { children: ReactNode; onReact?: () => void; emoji?: string; className?: string }) {
  const [pops, setPops] = useState<Pop[]>([]);
  const last = useRef({ t: 0, x: 0, y: 0 });
  const seq = useRef(0);

  const onPointerDown = (e: ReactPointerEvent<HTMLDivElement>) => {
    const prev = last.current;
    const close = Math.hypot(e.clientX - prev.x, e.clientY - prev.y) < DOUBLE_PX;
    if (e.timeStamp - prev.t < DOUBLE_MS && close) {
      last.current = { t: 0, x: 0, y: 0 };
      const r = e.currentTarget.getBoundingClientRect();
      setPops((p) => [...p, { id: ++seq.current, x: e.clientX - r.left, y: e.clientY - r.top }]);
      fx.emoji(e.clientX, e.clientY, emoji, 6);
      onReact?.();
    } else {
      last.current = { t: e.timeStamp, x: e.clientX, y: e.clientY };
    }
  };

  return (
    <div className={`relative touch-manipulation select-none ${className}`} onPointerDown={onPointerDown}>
      {children}
      <AnimatePresence>
        {pops.map((p) => (
          <span key={p.id} className="pointer-events-none absolute" style={{ left: p.x - 40, top: p.y - 40, width: 80, height: 80 }} aria-hidden>
            <motion.span
              className="block text-center text-[64px] leading-[80px]"
              initial={{ scale: 0.4, opacity: 0, y: 0 }}
              animate={{ scale: [0.4, 1.2, 1, 1], opacity: [0, 1, 1, 0], y: [0, 0, -8, -70] }}
              transition={{ duration: 0.9, times: [0, 0.25, 0.45, 1], ease: "easeOut" }}
              onAnimationComplete={() => setPops((all) => all.filter((x) => x.id !== p.id))}
            >
              {emoji}
            </motion.span>
          </span>
        ))}
      </AnimatePresence>
    </div>
  );
}
