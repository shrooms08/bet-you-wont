"use client";

import Link from "next/link";
import { useWalletHistory, type Session } from "@/hooks/data";
import { useNow } from "@/hooks/useNow";
import { explorerTx, network } from "@/lib/contracts";
import { formatWif, timeAgo } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { AppShell } from "../app/AppShell";
import { Qr } from "../app/Sheets";
import { WalletCard } from "../app/WalletCard";
import { Avatar } from "../ui/Avatar";
import { Headline } from "../ui/Headline";
import { SectionLabel } from "../ui/RaisedCard";
import { Skeleton } from "../ui/States";
import { WIF_LABEL } from "../ui/Money";

const PONS_URL = "https://www.ponsfamily.com/launchpad/0x5173b8eA6923c2d40267890D45C46a3480954773";

const KIND_STYLE = {
  won: { label: "won", cls: "text-accent-2", sign: "+" },
  refunded: { label: "refunded", cls: "text-cream", sign: "+" },
  lost: { label: "paid out", cls: "text-danger", sign: "−" },
  none: { label: "voted down", cls: "text-muted", sign: "" },
} as const;

function WalletMain({ s }: { s: Session }) {
  const mock = useMockMode();
  const history = useWalletHistory(s);
  const now = useNow();
  return (
    <div className="flex flex-col gap-6">
      <Headline line1="your" line2="wallet." accent="lime" />
      {s.profile && (
        <div className="flex items-center gap-3">
          <Avatar person={s.profile} size={48} />
          <p className="text-[20px] font-extrabold">@{s.profile.username}</p>
        </div>
      )}
      <WalletCard s={s} full />
      {s.address && <Qr value={s.address} size={200} label={`QR code of your wallet address ${s.address}`} />}

      <section className="raised flex flex-col gap-3 p-5" aria-label="how to get $wif">
        <h2 className="font-display text-[18px] uppercase tracking-normal">how to get $wif</h2>
        {network === "mainnet" ? (
          <>
            <a href={PONS_URL} target="_blank" rel="noreferrer" className="press-lip inline-flex min-h-[52px] items-center justify-center rounded-full border-[3px] border-line bg-primary px-6 text-[18px] font-extrabold text-on-primary">
              buy $wif on Pons ↗
            </a>
            <p className="text-[15px] text-muted">keep a little ETH in this wallet too: every move needs a tiny bit of gas (less than a cent).</p>
          </>
        ) : (
          <>
            <p className="text-[16px]">testnet: ask the team for test $wif (and a little test ETH).</p>
            <p className="text-[14px] text-muted">every move costs a tiny bit of ETH for gas (less than a cent).</p>
          </>
        )}
      </section>

      <section className="flex flex-col gap-3" aria-label="history">
        <SectionLabel>history</SectionLabel>
        {history.isLoading && <Skeleton count={2} height={72} />}
        {history.data?.items.length === 0 && <p className="text-[15px] text-muted">no settled dares or streak saves yet.</p>}
        <ul className="flex flex-col gap-2.5">
          {history.data?.items.map((it, i) => (
            <li key={`${it.type}-${it.type === "dare" ? it.dareId : it.week}-${i}`} className="raised flex items-center gap-3 px-4 py-3">
              {it.type === "dare" ? (
                <>
                  <Link href={withMock(`/d/${it.dareId}`, mock)} className="min-w-0 flex-1">
                    <p className="truncate text-[15px] font-extrabold">{it.text ?? `dare #${it.dareId}`}</p>
                    <p className="text-[13px] text-muted">
                      {it.role === "creator" ? "you dared" : "you did it"} · {it.outcome.toLowerCase()}
                      {timeAgo(it.at, now) ? ` · ${timeAgo(it.at, now)}` : ""}
                    </p>
                  </Link>
                  <span className={`text-right font-display text-[16px] tracking-normal ${KIND_STYLE[it.kind].cls}`}>
                    {it.kind !== "none" && `${KIND_STYLE[it.kind].sign}${formatWif(it.amount)}`}
                    <span className="block font-body text-[12px] font-extrabold text-muted">{KIND_STYLE[it.kind].label}</span>
                  </span>
                </>
              ) : (
                <>
                  <div className="min-w-0 flex-1">
                    <p className="text-[15px] font-extrabold">streak save · {it.week}</p>
                    <p className="text-[13px] text-muted">burned{timeAgo(it.at, now) ? ` · ${timeAgo(it.at, now)}` : ""}</p>
                  </div>
                  <span className="font-display text-[16px] tracking-normal text-danger">−{formatWif(it.amount)}</span>
                </>
              )}
              {it.tx && (
                <a href={explorerTx(it.tx)} target="_blank" rel="noreferrer" className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[3px] border-line text-[15px]" aria-label="view transaction">
                  ↗
                </a>
              )}
            </li>
          ))}
        </ul>
        <p className="text-[13px] text-muted">amounts in {WIF_LABEL}.</p>
      </section>
    </div>
  );
}

export function WalletScreen() {
  return <AppShell>{(s) => <WalletMain s={s} />}</AppShell>;
}
