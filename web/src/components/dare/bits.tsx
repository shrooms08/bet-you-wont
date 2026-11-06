"use client";

import { motion } from "motion/react";
import { useEffect, useRef, useState } from "react";
import { formatWif, handle } from "@/lib/format";
import { springs } from "@/lib/motion";
import type { DareView } from "@/lib/types";
import { ShareIcon } from "../ui/icons";

/** 🔥 toggle with a count. Optimistic (the caller's mutation patches caches). */
export function ReactionButton({ reacted, count, onToggle, disabled }: { reacted: boolean; count: number; onToggle: () => void; disabled?: boolean }) {
  return (
    <motion.button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={reacted}
      aria-label={`${reacted ? "remove your fire" : "fire"}: ${count}`}
      whileTap={{ scale: 0.85 }}
      transition={springs.bouncy}
      className={`flex min-h-11 items-center gap-1.5 rounded-full border-[3px] border-line px-3 text-[16px] font-extrabold ${reacted ? "bg-primary text-on-primary" : "bg-surface"}`}
    >
      <motion.span key={String(reacted)} initial={{ scale: reacted ? 0.4 : 1 }} animate={{ scale: 1 }} transition={springs.bouncy} aria-hidden>
        🔥
      </motion.span>
      <span className="tabular-nums">{count}</span>
    </motion.button>
  );
}

/** Copies the dare's link (the share card comes in 3c-2b-2). */
export function ShareButton({ dareId, label = false }: { dareId: number; label?: boolean }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(`${window.location.origin}/d/${dareId}`);
        setCopied(true);
        setTimeout(() => setCopied(false), 1800);
      }}
      aria-label={copied ? "link copied" : "copy link to this dare"}
      className="flex min-h-11 items-center gap-1.5 rounded-full border-[3px] border-line bg-surface px-3 text-[15px] font-extrabold"
    >
      <ShareIcon size={18} />
      {(label || copied) && <span aria-live="polite">{copied ? "copied" : "share"}</span>}
    </button>
  );
}

// Only one feed video plays at a time.
let playing: HTMLVideoElement | null = null;

/**
 * Autoplays muted when at least 60% visible, pauses otherwise; tap toggles sound.
 * Shows the poster until it plays. `controls` mode is for the dare detail page.
 */
export function AutoVideo({ src, poster, label, className = "", controls = false }: { src: string; poster?: string | null; label: string; className?: string; controls?: boolean }) {
  const ref = useRef<HTMLVideoElement>(null);
  const [muted, setMuted] = useState(true);
  useEffect(() => {
    const v = ref.current;
    if (!v || controls) return;
    const io = new IntersectionObserver(
      ([e]) => {
        if (e.intersectionRatio >= 0.6) {
          if (playing && playing !== v) playing.pause();
          playing = v;
          void v.play().catch(() => {});
        } else {
          v.pause();
          if (playing === v) playing = null;
        }
      },
      { threshold: [0, 0.6, 1] },
    );
    io.observe(v);
    return () => io.disconnect();
  }, [controls]);
  return (
    <div className="relative">
      <video
        ref={ref}
        src={src}
        poster={poster ?? undefined}
        muted={muted}
        playsInline
        loop={!controls}
        controls={controls}
        preload="metadata"
        aria-label={label}
        onClick={controls ? undefined : () => setMuted((m) => !m)}
        className={className}
      />
      {!controls && (
        <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-bg/80 px-2.5 py-1 text-[13px] font-extrabold" aria-hidden>
          {muted ? "🔇 tap for sound" : "🔊"}
        </span>
      )}
    </div>
  );
}

/** "@juju did it. 95 $wif paid. 5 burned." etc. */
export function resultLine(d: DareView): string {
  const pay = formatWif(d.payout ?? d.amount);
  const burn = formatWif(d.burned ?? "0");
  if (d.state === "Cancelled") return `called off before anyone took it. ${handle(d.creator)} got it all back.`;
  if (d.outcome === "Passed") return `${handle(d.doer)} did it. ${pay} $wif paid. ${burn} burned.`;
  if (d.outcome === "Failed") return `nah, cap. ${pay} back to ${handle(d.creator)}. ${burn} burned.`;
  return `no proof. ${pay} back to ${handle(d.creator)}.`;
}
