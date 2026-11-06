"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useRef, useSyncExternalStore } from "react";
import { registerFx } from "@/lib/fx";
import { fxEnabled } from "@/lib/motion";
import { GLYPHS, ParticlePool, spawnBurst, spawnConfetti, spawnEmoji } from "@/lib/particles";

const CONFETTI_COLORS = ["#B8DA3C", "#9077EA", "#7251E4", "#F2F0E6", "#CABDF5"] as const;
const GLYPH_FONT = (px: number) => `bold ${px}px ui-monospace, SFMono-Regular, Menlo, monospace`;
const EMOJI_FONT = (px: number) => `${px}px system-ui, sans-serif`;

/**
 * The first glyph draw on the overlay canvas was a 70-125 ms long task on the first tap (4x CPU
 * throttle): font-fallback lookup for glyphs like ○ □ ≡ plus first use of the full-screen canvas.
 * Do that work once while the browser is idle: draw every glyph almost invisibly on the real
 * canvas, then clear it.
 */
function warmGlyphs(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.save();
  ctx.globalAlpha = 0.004;
  for (const px of [10, 11, 12]) {
    ctx.font = GLYPH_FONT(px);
    for (const g of GLYPHS) ctx.fillText(g, 20, 20);
  }
  ctx.font = EMOJI_FONT(16);
  ctx.fillText("🔥", 20, 20);
  ctx.restore();
  ctx.clearRect(0, 0, w, h);
}

function subscribeFine(cb: () => void) {
  const mq = window.matchMedia("(pointer: fine)");
  mq.addEventListener("change", cb);
  return () => mq.removeEventListener("change", cb);
}
const useFinePointer = () =>
  useSyncExternalStore(subscribeFine, () => window.matchMedia("(pointer: fine)").matches, () => false);

// Pixel-art arrow, 10x14 cells, 2px per cell (20x28px). X = dark outline, L = lime fill.
const ARROW = [
  "X.........",
  "XX........",
  "XLX.......",
  "XLLX......",
  "XLLLX.....",
  "XLLLLX....",
  "XLLLLLX...",
  "XLLLLLLX..",
  "XLLLLLLLX.",
  "XLLLLXXXXX",
  "XLLXLX....",
  "XLX.XLX...",
  "XX..XLX...",
  "X....XX...",
];
const ARROW_RECTS = ARROW.flatMap((row, y) =>
  [...row].flatMap((c, x) => (c === "." ? [] : [{ x: x * 2, y: y * 2, fill: c === "X" ? "#14141A" : "#B8DA3C" }])),
);

const TEXT_TARGET =
  'input:not([type=button]):not([type=submit]):not([type=checkbox]):not([type=radio]):not([type=file]):not([type=range]), textarea, [contenteditable=""], [contenteditable="true"]';
const INTERACTIVE = 'a, button, [role=button], label, summary, select, [data-cursor="hover"]';

/**
 * Mounted once in the root layout. Owns:
 * - the particle canvas (click/tap bursts on every device, stamp confetti, emoji reactions)
 * - the pixel cursor (fine pointers only)
 * - the dot spotlight around the cursor (fine pointers only)
 * Everything decorative is off under prefers-reduced-motion.
 */
export function FxLayer() {
  const reduced = useReducedMotion() ?? false;
  const fine = useFinePointer();
  const enabled = fxEnabled({ reducedMotion: reduced, finePointer: fine });
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const cursorRef = useRef<HTMLDivElement>(null);
  const reducedRef = useRef(reduced);
  useEffect(() => {
    reducedRef.current = reduced;
  }, [reduced]);

  // ---- particles ---------------------------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const pool = new ParticlePool(60);
    let raf = 0;
    let last = 0;
    let dpr = 1;

    const resize = () => {
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      canvas.width = Math.round(window.innerWidth * dpr);
      canvas.height = Math.round(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener("resize", resize);
    const idle = window.requestIdleCallback ?? ((cb: () => void) => window.setTimeout(cb, 1200));
    const idleId = idle(() => warmGlyphs(ctx, canvas.width, canvas.height));

    const frame = (t: number) => {
      const dt = last ? Math.min(0.05, (t - last) / 1000) : 0.016;
      last = t;
      pool.step(dt);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const p of pool.items) {
        if (!p.alive) continue;
        const k = p.life / p.maxLife; // 1 -> 0
        ctx.globalAlpha = Math.min(1, k * 1.6);
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        if (p.kind === "dot") {
          ctx.fillStyle = p.color;
          ctx.beginPath();
          ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
          ctx.fill();
        } else {
          ctx.font = p.kind === "emoji" ? EMOJI_FONT(p.size) : GLYPH_FONT(p.size);
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillStyle = p.color;
          ctx.fillText(p.glyph, 0, 0);
        }
        ctx.restore();
      }
      ctx.globalAlpha = 1;
      if (pool.alive > 0) raf = requestAnimationFrame(frame);
      else {
        raf = 0;
        last = 0;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
      }
    };
    const kick = () => {
      if (!raf) raf = requestAnimationFrame(frame);
    };

    const NO_BURST = 'input, textarea, select, [contenteditable=""], [contenteditable="true"], [data-no-burst]';
    const onDown = (e: PointerEvent) => {
      if (reducedRef.current || !e.isPrimary) return;
      // no bursts while typing or inside the camera sheet
      if ((e.target as Element | null)?.closest?.(NO_BURST)) return;
      spawnBurst(pool, e.clientX, e.clientY, performance.now());
      kick();
    };
    window.addEventListener("pointerdown", onDown, { passive: true });

    const unregister = registerFx({
      burst: (x, y) => {
        if (reducedRef.current) return;
        spawnBurst(pool, x, y, performance.now());
        kick();
      },
      confetti: (x, y) => {
        if (reducedRef.current) return;
        spawnConfetti(pool, x, y, performance.now(), CONFETTI_COLORS);
        kick();
      },
      emoji: (x, y, emoji, count = 6) => {
        if (reducedRef.current) return;
        spawnEmoji(pool, x, y, performance.now(), emoji, count);
        kick();
      },
      reduced: () => reducedRef.current,
    });

    return () => {
      cancelAnimationFrame(raf);
      (window.cancelIdleCallback ?? window.clearTimeout)(idleId);
      window.removeEventListener("resize", resize);
      window.removeEventListener("pointerdown", onDown);
      unregister();
    };
  }, []);

  // ---- cursor + spotlight (fine pointer, motion allowed) ------------------------------------
  const { pixelCursor, spotlight } = enabled;
  useEffect(() => {
    if (!pixelCursor && !spotlight) return;
    const root = document.documentElement;
    const cursor = cursorRef.current;
    if (pixelCursor) root.classList.add("byw-pixel-cursor");
    let x = -100;
    let y = -100;
    let mode: "arrow" | "hover" | "hidden" = "hidden";
    let raf = 0;
    const paint = () => {
      raf = 0;
      if (cursor) {
        cursor.style.transform = `translate3d(${x}px, ${y}px, 0)`;
        cursor.dataset.mode = mode;
      }
      if (spotlight) {
        root.style.setProperty("--mx", `${x}px`);
        root.style.setProperty("--my", `${y}px`);
      }
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(paint);
    };
    const onMove = (e: PointerEvent) => {
      if (e.pointerType !== "mouse" && e.pointerType !== "pen") return;
      x = e.clientX;
      y = e.clientY;
      const target = e.target as Element | null;
      mode = target?.closest?.(TEXT_TARGET) ? "hidden" : target?.closest?.(INTERACTIVE) ? "hover" : "arrow";
      schedule();
    };
    const onLeave = (e: MouseEvent) => {
      if (e.relatedTarget) return;
      mode = "hidden";
      x = -100;
      y = -100;
      schedule();
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    document.addEventListener("mouseout", onLeave);
    return () => {
      cancelAnimationFrame(raf);
      root.classList.remove("byw-pixel-cursor");
      root.style.removeProperty("--mx");
      root.style.removeProperty("--my");
      window.removeEventListener("pointermove", onMove);
      document.removeEventListener("mouseout", onLeave);
    };
  }, [pixelCursor, spotlight]);

  return (
    <>
      {spotlight && <div className="byw-spotlight" aria-hidden />}
      <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 z-[90] h-full w-full" aria-hidden />
      {pixelCursor && (
        <div ref={cursorRef} className="byw-cursor" data-mode="hidden" aria-hidden>
          <svg width="20" height="28" viewBox="0 0 20 28" shapeRendering="crispEdges">
            {ARROW_RECTS.map((r) => (
              <rect key={`${r.x}-${r.y}`} x={r.x} y={r.y} width="2" height="2" fill={r.fill} />
            ))}
          </svg>
        </div>
      )}
    </>
  );
}
