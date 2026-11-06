"use client";

import { useState } from "react";

/**
 * A black-and-white cut-out photo, slightly rotated, like a sticker on the card.
 * If the file is missing it renders a neutral placeholder box naming the file.
 */
export function Sticker({ src, alt, rotate = 0, width = 170 }: { src: string; alt: string; rotate?: number; width?: number }) {
  const [missing, setMissing] = useState(false);
  const style = { width, transform: `rotate(${rotate}deg)` };
  if (missing) {
    return (
      <div
        style={{ ...style, height: width * 1.4 }}
        className="grid place-items-center rounded-2xl border-[3px] border-dashed border-line bg-inset p-3 text-center text-[13px] text-muted"
        role="img"
        aria-label={alt}
      >
        image missing: {src.split("/").pop()}
      </div>
    );
  }
  return (
    // eslint-disable-next-line @next/next/no-img-element -- transparent PNG cut-outs, sized by CSS
    <img
      src={src}
      alt={alt}
      style={{ ...style, filter: "grayscale(1) drop-shadow(0 6px 0 rgba(0,0,0,.35))" }}
      className="block h-auto select-none"
      draggable={false}
      onError={() => setMissing(true)}
    />
  );
}
