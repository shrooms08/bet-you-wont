"use client";

import QRCode from "qrcode";
import { useEffect, useState } from "react";
import { useBalances, type Session } from "@/hooks/data";
import { activeChain } from "@/lib/contracts";
import { formatUsd, formatWif, shortAddress } from "@/lib/format";
import { usePrice } from "@/hooks/data";
import { CopyIcon } from "../ui/icons";
import { WIF_LABEL } from "../ui/Money";
import { PillButton } from "../ui/PillButton";

/** QR of the wallet address (cream on ink, high contrast for scanners). */
export function AddressQr({ address, size = 200 }: { address: string; size?: number }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(address, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#14141A", light: "#F2F0E6" } }).then(
      (s) => live && setSvg(s),
    );
    return () => {
      live = false;
    };
  }, [address]);
  return (
    <div
      className="mx-auto overflow-hidden rounded-[24px] border-[3px] border-line bg-cream p-2"
      style={{ width: size, height: size }}
      role="img"
      aria-label={`QR code of your wallet address ${address}`}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

/** Address + copy, $wif and ETH balances. The only place wallet addresses are shown. */
export function WalletCard({ s, full = false }: { s: Session; full?: boolean }) {
  const balances = useBalances(s);
  const price = usePrice();
  const [copied, setCopied] = useState(false);
  const address = s.address ?? "";
  async function copy() {
    await navigator.clipboard.writeText(address);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  const eth = balances.eth === undefined ? "…" : Number(formatEth(balances.eth)).toLocaleString("en-US", { maximumFractionDigits: 5 });
  return (
    <div className="raised flex flex-col gap-4 p-5">
      <div className="flex items-center justify-between gap-3">
        <div className="min-w-0">
          <p className="font-display text-[12px] uppercase tracking-[0.04em] text-muted">your address</p>
          <p className={`mt-1 font-extrabold tracking-[-0.03em] ${full ? "break-all text-[17px]" : "text-[22px]"}`}>
            {full ? address : shortAddress(address)}
          </p>
        </div>
        <PillButton variant="secondary" size="sm" onClick={() => void copy()} aria-label="copy your address">
          <CopyIcon size={18} />
          {copied ? "copied" : "copy"}
        </PillButton>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-[24px] border-[3px] border-line bg-inset p-4">
          <p className="font-display text-[24px] leading-none tracking-normal">{balances.wif === undefined ? "…" : formatWif(balances.wif)}</p>
          <p className="mt-1 text-[14px]">{WIF_LABEL}</p>
          {balances.wif !== undefined && formatUsd(balances.wif, price.data?.usd) && (
            <p className="text-[13px] text-muted">{formatUsd(balances.wif, price.data?.usd)}</p>
          )}
        </div>
        <div className="rounded-[24px] border-[3px] border-line bg-inset p-4">
          <p className="font-display text-[24px] leading-none tracking-normal">{eth}</p>
          <p className="mt-1 text-[14px]">ETH</p>
          <p className="text-[13px] text-muted">for gas on {activeChain.name}</p>
        </div>
      </div>
    </div>
  );
}

function formatEth(wei: bigint): string {
  const s = wei.toString().padStart(19, "0");
  return `${s.slice(0, -18)}.${s.slice(-18)}`;
}
