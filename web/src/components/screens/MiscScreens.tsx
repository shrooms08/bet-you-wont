"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { type Session } from "@/hooks/data";
import { groupName } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { AppShell } from "../app/AppShell";
import { DareText } from "../app/DareText";
import { AddressQr, WalletCard } from "../app/WalletCard";
import { Avatar } from "../ui/Avatar";
import { Headline } from "../ui/Headline";
import { PillButton, PillLink } from "../ui/PillButton";

const IS_DEV = process.env.NODE_ENV !== "production";

/** /new placeholder: the create-a-dare screen is built in 3c-2b. */
function NewMain({ s }: { s: Session }) {
  const params = useSearchParams();
  const mock = useMockMode();
  const text = params.get("text");
  const group = params.get("group");
  const g = s.me.data?.groups.find((x) => String(x.id) === group);
  const devHref = `/dev?${new URLSearchParams({ ...(group ? { group } : {}), ...(text ? { text } : {}) }).toString()}#create`;
  return (
    <div className="flex flex-col gap-6">
      <Headline line1="new" line2="dare." accent="lime" />
      <div className="raised flex flex-col gap-4 p-5">
        <p className="text-[20px] font-extrabold tracking-[-0.04em]">the create screen lands in the next build.</p>
        {text && (
          <>
            <p className="text-[15px] text-muted">you picked{g || group ? ` for ${groupName(Number(group), g?.name)}` : ""}:</p>
            <DareText text={text} />
          </>
        )}
        {IS_DEV ? (
          <>
            <p className="text-[15px] text-muted">for now, create it in the dev harness (it keeps your text and crew).</p>
            <PillLink href={devHref}>open the dev harness</PillLink>
          </>
        ) : (
          <p className="text-[15px] text-muted">check back soon.</p>
        )}
        <PillLink href={withMock("/home", mock)} variant="ghost">
          back home
        </PillLink>
      </div>
    </div>
  );
}

export function NewScreen() {
  return <AppShell active="new">{(s) => <NewMain s={s} />}</AppShell>;
}

/** /wallet: address, balances, QR. The only screen that shows wallet addresses. */
export function WalletScreen() {
  return (
    <AppShell active="wallet">
      {(s) => (
        <div className="flex flex-col gap-6">
          <Headline line1="your" line2="wallet." accent="lime" />
          <WalletCard s={s} full />
          {s.address && <AddressQr address={s.address} size={220} />}
          <p className="text-[16px] leading-snug text-muted">
            every move costs a tiny bit of ETH for gas (less than a cent). add a little ETH and some $wif to start daring
          </p>
        </div>
      )}
    </AppShell>
  );
}

/** /profile: who you are + log out. */
export function ProfileScreen() {
  const router = useRouter();
  const mock = useMockMode();
  return (
    <AppShell active="profile">
      {(s) => (
        <div className="flex flex-col gap-6">
          <Headline line1="that's" line2="you." accent="lime" />
          <div className="raised flex flex-col items-center gap-4 p-6 text-center">
            <Avatar person={s.profile} size={120} />
            <p className="text-[30px] font-extrabold tracking-[-0.045em]">@{s.profile?.username}</p>
            <PillLink href={withMock("/start?step=you&from=profile", mock)} variant="secondary">
              edit @name or photo
            </PillLink>
          </div>
          <PillButton
            variant="ghost"
            onClick={async () => {
              if (!s.mock) await s.byw.logout();
              router.replace("/start");
            }}
          >
            log out
          </PillButton>
        </div>
      )}
    </AppShell>
  );
}
