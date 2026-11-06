"use client";

import { usePrice } from "@/hooks/data";
import { network } from "@/lib/contracts";
import { formatUsd, formatWif } from "@/lib/format";

/** On testnet the token is mWIF, a stand-in for $wif. */
export const WIF_LABEL = network === "testnet" ? "$wif (test)" : "$wif";

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
  if (wei === null || wei === undefined) return null;
  const usd = formatUsd(wei, price.data?.usd);
  const main = { sm: "text-[17px]", md: "text-[20px]", lg: "text-[28px]" }[size];
  return (
    <span className={`inline-flex flex-col leading-none ${align === "right" ? "items-end text-right" : ""} ${className}`}>
      <span className={`whitespace-nowrap font-display tracking-normal text-money ${main}`}>
        {formatWif(wei)} $wif
        {network === "testnet" && <span className="ml-1 font-body text-[12px] font-extrabold text-muted">(test)</span>}
      </span>
      {usd && <span className="mt-1 text-[13px] font-bold text-muted">{usd}</span>}
    </span>
  );
}
