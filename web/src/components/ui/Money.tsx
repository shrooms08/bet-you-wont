"use client";

import { animate, useReducedMotion } from "motion/react";
import { useEffect, useRef } from "react";
import { formatUnits } from "viem";
import { usePrice } from "@/hooks/data";
import { network } from "@/lib/contracts";
import { formatTokens, formatUsd, formatWif } from "@/lib/format";
import { durations } from "@/lib/motion";

/** On testnet the token is mWIF, a stand-in for $wif. */
export const WIF_LABEL = network === "testnet" ? "$wif (test)" : "$wif";

/**
 * Counts the displayed number from its previous value to the new one in 300ms. No animation on
 * first render or under reduced motion. Writes textContent directly (no React re-render per frame).
 */
function useCountUp(target: number) {
  const ref = useRef<HTMLSpanElement>(null);
  const prev = useRef<number | null>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const from = prev.current;
    prev.current = target;
    const el = ref.current;
    if (!el || from === null || from === target || reduced) {
      if (el) el.textContent = formatTokens(target);
      return;
    }
    const controls = animate(from, target, {
      duration: durations.countUp,
      ease: "easeOut",
      onUpdate: (v) => {
        el.textContent = formatTokens(v);
      },
    });
    return () => controls.stop();
  }, [target, reduced]);
  return ref;
}

/** Heavy "5,000 $wif" plus a muted "≈ $7" (hidden when the price API is down). */
export function Money({
  wei,
  size = "md",
  align = "left",
  className = "",
}: {
  wei: string | bigint | null | undefined;
  size?: "sm" | "md" | "lg";
  align?: "left" | "right";
  className?: string;
}) {
  const price = usePrice();
  const target = wei === null || wei === undefined ? 0 : Number(formatUnits(BigInt(wei), 18));
  const numRef = useCountUp(target);
  if (wei === null || wei === undefined) return null;
  const usd = formatUsd(wei, price.data?.usd);
  const main = { sm: "text-[17px]", md: "text-[20px]", lg: "text-[28px]" }[size];
  return (
    <span className={`inline-flex flex-col leading-none ${align === "right" ? "items-end text-right" : ""} ${className}`}>
      <span className={`whitespace-nowrap font-display tracking-normal text-money ${main}`}>
        <span ref={numRef} className="tabular-nums">
          {formatWif(wei)}
        </span>{" "}
        $wif
        {network === "testnet" && <span className="ml-1 font-body text-[12px] font-extrabold text-muted">(test)</span>}
      </span>
      {usd && <span className="mt-1 text-[13px] font-bold text-muted">{usd}</span>}
    </span>
  );
}
