"use client";

import { motion } from "motion/react";
import { useId, useState } from "react";

/**
 * A black-and-white cut-out photo, slightly rotated, like a sticker on the card.
 * If the file is missing it renders a neutral placeholder box naming the file.
 */
export function Sticker({
  src,
  alt,
  rotate = 0,
  width,
  height,
  float = false,
}: {
  src: string;
  alt: string;
  rotate?: number;
  /** Give a width (height follows the image) or a height (width follows). Default width 170. */
  width?: number;
  height?: number;
  /** Gently float (y ±4px, rotate ±1deg) on a 4-6s loop with a per-sticker phase. */
  float?: boolean;
}) {
  const [missing, setMissing] = useState(false);
  // deterministic per-instance timing (no Math.random during render: keeps SSR and client equal)
  const seed = [...useId()].reduce((a, ch) => a + ch.charCodeAt(0), 0) + src.length;
  const floatDuration = 4 + (seed % 21) / 10; // 4.0 - 6.0 s
  const floatDelay = (seed % 13) / 10;
  const size = height !== undefined ? { height, width: "auto" as const } : { width: width ?? 170 };
  const style = { ...size, transform: `rotate(${rotate}deg)` };
  if (missing) {
    const h = height ?? (width ?? 170) * 1.4;
    return (
      <div
        style={{ transform: style.transform, height: h, width: h / 1.4 }}
        className="grid place-items-center rounded-2xl border-[3px] border-dashed border-line bg-inset p-3 text-center text-[13px] text-muted"
        role="img"
        aria-label={alt}
      >
        image missing: {src.split("/").pop()}
      </div>
    );
  }
  const img = (
    // eslint-disable-next-line @next/next/no-img-element -- transparent PNG cut-outs, sized by CSS
    <img
      src={src}
      alt={alt}
      style={{ ...style, filter: "grayscale(1) drop-shadow(0 6px 0 rgba(0,0,0,.35))" }}
      className="pointer-events-none block select-none"
      decoding="async"
      draggable={false}
      onError={() => setMissing(true)}
    />
  );
  if (!float) return img;
  return (
    <motion.div
      animate={{ y: [0, -4, 0, 4, 0], rotate: [0, 1, 0, -1, 0] }}
      transition={{ duration: floatDuration, delay: floatDelay, repeat: Infinity, ease: "easeInOut" }}
    >
      {img}
    </motion.div>
  );
}
