"use client";

import { useId } from "react";

// The BYW mark (public/brand/byw-mark.svg): lime and violet figures with a cream overlap.
// Same paths and transform as the source file; the viewBox is cropped to the mark's bounds
// (x 51-973, y 238-786 of the 1024 canvas) so `size` is the visible height.
const VIEW = { x: 41, y: 228, w: 942, h: 568 } as const;
export const LOGO_ASPECT = VIEW.w / VIEW.h;

const ARC_LIME = "M425 520 L447 520 C515 520 563 468 563 395 L563 381";
const ARC_VIOLET = "M701 520 L679 520 C611 520 563 468 563 395 L563 381";

export function Logo({
  size = 32,
  className,
  title = "Bet You Won't",
  decorative = false,
}: {
  /** Rendered height in px (width follows the mark's aspect ratio). */
  size?: number;
  className?: string;
  title?: string;
  /** true when a neighbouring label already names the brand (hides it from screen readers). */
  decorative?: boolean;
}) {
  // One mask id per instance so several logos on a page never share (or clash on) a mask.
  const maskId = `byw-mark-${useId().replace(/[^a-zA-Z0-9_-]/g, "")}`;
  const stroke = { fill: "none", strokeWidth: 66, strokeLinecap: "round", strokeLinejoin: "round" } as const;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`}
      height={size}
      width={Math.round(size * LOGO_ASPECT)}
      className={className}
      {...(decorative ? { "aria-hidden": true, focusable: false } : { role: "img", "aria-label": title })}
    >
      <defs>
        <mask id={maskId} maskUnits="userSpaceOnUse" x="0" y="0" width="1200" height="900">
          <rect width="1200" height="900" fill="black" />
          <path d={ARC_LIME} {...stroke} stroke="white" />
        </mask>
      </defs>
      <g transform="translate(-990.26 -686.61) scale(2.66358)">
        <path d={ARC_LIME} {...stroke} stroke="#B8DA3C" />
        <path d={ARC_VIOLET} {...stroke} stroke="#7251E4" />
        <circle cx="444" cy="400" r="53" fill="#B8DA3C" />
        <circle cx="684" cy="400" r="53" fill="#7251E4" />
        <path d={ARC_VIOLET} {...stroke} stroke="#F2F0E6" mask={`url(#${maskId})`} />
      </g>
    </svg>
  );
}
