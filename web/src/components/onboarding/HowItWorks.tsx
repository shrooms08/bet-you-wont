"use client";

import { motion, useMotionValue, useSpring, useTransform, type PanInfo } from "motion/react";
import { useState, type PointerEvent as ReactPointerEvent } from "react";
import { listVariants, springs } from "@/lib/motion";
import { Headline } from "../ui/Headline";
import { PillButton } from "../ui/PillButton";
import { Sticker } from "./Sticker";

export const HOW = [
  { src: "/onboarding/o1-dared.png", alt: "someone riding a wheelie bin down a busy street", title: "1. get dared", body: "a friend bets you won't do something, and puts $wif on it.", rot: -4 },
  { src: "/onboarding/o1-proof.png", alt: "a grandma doing a skateboard trick", title: "2. do it, post proof", body: "say aight bet, do the thing, post a photo or a clip.", rot: 3 },
  { src: "/onboarding/o1-paid.png", alt: "two people dressed as ghosts, playing cards with drinks", title: "3. friends vote, you get paid", body: "the group votes. if it counts, the bounty is yours.", rot: -2 },
];
type How = (typeof HOW)[number];

// Stickers have a fixed height so the overlap is exact: 40% (88px) sits above the card's top edge.
const STICKER_H = 220;
const STICKER_OVERLAP = Math.round(STICKER_H * 0.4);

function CardBody({ c }: { c: How }) {
  return (
    <>
      <h2 className="mt-6 font-display text-[24px] uppercase leading-none tracking-[-0.02em] desk:text-[26px]">{c.title}</h2>
      <p className="mt-2 max-w-[300px] text-[17px] leading-snug text-muted">{c.body}</p>
    </>
  );
}

function StickerSlot({ c }: { c: How }) {
  return (
    <div style={{ marginTop: -STICKER_OVERLAP, height: STICKER_H }} className="flex items-start justify-center">
      <Sticker src={c.src} alt={c.alt} rotate={c.rot} height={STICKER_H} float />
    </div>
  );
}

// ---------------------------------------------------------------- mobile deck

// All three cards stay mounted and stacked; "next"/"back" only change which state each animates to
// (mounting a card mid-transition was a ~70 ms long task at 4x CPU throttle). The current card is
// centered; the leaving one shrinks, tilts and slides out while the next comes in from the other side.
type Slot = "left" | "center" | "right";
const cardVariants = {
  left: { x: "-60%", scale: 0.86, rotate: -3, opacity: 0, transitionEnd: { visibility: "hidden" as const } },
  center: { x: 0, scale: 1, rotate: 0, opacity: 1, visibility: "visible" as const },
  right: { x: "60%", scale: 0.86, rotate: 3, opacity: 0, transitionEnd: { visibility: "hidden" as const } },
};
// The sticker trails its card by ~8% (in the direction of travel) for depth.
const stickerVariants = {
  left: (dir: number) => ({ x: dir >= 0 ? "8%" : "-8%" }),
  center: { x: 0 },
  right: (dir: number) => ({ x: dir >= 0 ? "8%" : "-8%" }),
};
const SWIPE = 80; // px of offset (+ velocity bonus) needed to change cards

function DeckCard({ c, index, slot, dir, onSwipe }: { c: How; index: number; slot: Slot; dir: number; onSwipe: (d: 1 | -1) => void }) {
  const x = useMotionValue(0);
  // while dragging, the sticker lags 8% behind the card
  const stickerDrag = useTransform(x, (v) => -v * 0.08);
  const active = slot === "center";
  const onDragEnd = (_: unknown, info: PanInfo) => {
    const swipe = info.offset.x + info.velocity.x * 0.2;
    if (swipe < -SWIPE) onSwipe(1);
    else if (swipe > SWIPE) onSwipe(-1);
  };
  return (
    <motion.section
      custom={dir}
      variants={cardVariants}
      initial={false}
      animate={slot}
      transition={springs.smooth}
      drag={active ? "x" : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.22}
      onDragEnd={onDragEnd}
      style={{ x, gridArea: "1 / 1", zIndex: active ? 1 : 0 }}
      inert={!active}
      aria-hidden={!active || undefined}
      className="raised flex w-full touch-pan-y cursor-grab select-none flex-col items-center px-6 pb-6 text-center active:cursor-grabbing"
      aria-roledescription="slide"
      aria-label={`${index + 1} of ${HOW.length}`}
    >
      <motion.div style={{ x: stickerDrag }}>
        <motion.div custom={dir} variants={stickerVariants} transition={{ type: "spring", stiffness: 200, damping: 28 }}>
          <StickerSlot c={c} />
        </motion.div>
      </motion.div>
      <CardBody c={c} />
    </motion.section>
  );
}

/** Mobile O1: a swipeable/draggable deck with a "next" button and layout-animated dots. */
export function HowDeck({ onDone }: { onDone: () => void }) {
  const [[idx, dir], setPage] = useState<[number, number]>([0, 0]);
  const last = HOW.length - 1;
  // Swipes rubber-band at the ends (drag elastic); only the button leaves the deck on the last card.
  const swipe = (d: 1 | -1) => {
    const n = idx + d;
    if (n < 0 || n > last) return;
    setPage([n, d]);
  };
  const next = () => (idx >= last ? onDone() : swipe(1));
  return (
    <>
      {/* full-bleed and clipped sideways, so parked cards never cause horizontal scroll */}
      <div className="-mx-5 overflow-x-clip px-5">
        <div className="grid" style={{ paddingTop: STICKER_OVERLAP + 8 }} aria-roledescription="carousel" aria-label="how it works">
          {HOW.map((c, i) => (
            <DeckCard key={c.src} c={c} index={i} slot={i === idx ? "center" : i < idx ? "left" : "right"} dir={dir} onSwipe={swipe} />
          ))}
        </div>
      </div>
      <div className="flex items-center justify-between">
        <div className="flex gap-2" aria-hidden>
          {HOW.map((c, i) => (
            <motion.span
              key={c.src}
              layout
              transition={springs.snappy}
              className={`h-3 rounded-full ${i === idx ? "w-8 bg-primary" : "w-3 bg-line"}`}
            />
          ))}
        </div>
        <PillButton size="lg" onClick={next}>
          {idx >= last ? "let's go" : "next"}
        </PillButton>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- tablet/desktop row

const riseVariants = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: springs.smooth },
};

/** Lifts 6px on hover and tilts toward the cursor, up to 4 degrees. */
function TiltCard({ c, index }: { c: How; index: number }) {
  const rx = useMotionValue(0);
  const ry = useMotionValue(0);
  const rotateX = useSpring(rx, { stiffness: 300, damping: 30 });
  const rotateY = useSpring(ry, { stiffness: 300, damping: 30 });
  const onMove = (e: ReactPointerEvent<HTMLElement>) => {
    if (e.pointerType !== "mouse") return;
    const r = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - r.left) / r.width - 0.5;
    const py = (e.clientY - r.top) / r.height - 0.5;
    ry.set(px * 8); // -4..4 deg
    rx.set(-py * 8);
  };
  const onLeave = () => {
    rx.set(0);
    ry.set(0);
  };
  return (
    <motion.section
      variants={riseVariants}
      whileHover={{ y: -6 }}
      onPointerMove={onMove}
      onPointerLeave={onLeave}
      style={{ rotateX, rotateY, transformPerspective: 900 }}
      className="raised flex flex-col items-center px-6 pb-6 text-center"
      aria-label={`${index + 1} of ${HOW.length}`}
    >
      <StickerSlot c={c} />
      <CardBody c={c} />
    </motion.section>
  );
}

function HowRow({ onDone }: { onDone: () => void }) {
  return (
    <>
      <motion.div
        className="grid grid-cols-3 gap-6"
        style={{ paddingTop: STICKER_OVERLAP + 8 }}
        variants={{ ...listVariants, show: { transition: { staggerChildren: 0.08, delayChildren: 0.1 } } }}
        initial="hidden"
        animate="show"
        aria-label="how it works"
      >
        {HOW.map((c, i) => (
          <TiltCard key={c.src} c={c} index={i} />
        ))}
      </motion.div>
      <div className="flex justify-center">
        <PillButton size="lg" onClick={onDone} className="min-w-[240px]">
          let&apos;s go
        </PillButton>
      </div>
    </>
  );
}

/**
 * O1 "how it works". Both layouts render; CSS shows the deck below 768px and the row above, so
 * there is no layout jump on hydration.
 */
export function StepHow({ onDone }: { onDone: () => void }) {
  return (
    <>
      <div className="tab:text-center">
        <Headline line1="here's" line2="the deal." accent="violet" />
      </div>
      <div className="flex flex-col gap-6 tab:hidden">
        <HowDeck onDone={onDone} />
      </div>
      <div className="hidden flex-col gap-6 tab:flex">
        <HowRow onDone={onDone} />
      </div>
    </>
  );
}
