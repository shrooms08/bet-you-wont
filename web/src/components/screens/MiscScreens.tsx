"use client";

import { useRouter } from "next/navigation";
import { useMockMode, withMock } from "@/lib/mock";
import { AppShell } from "../app/AppShell";
import { AddressQr, WalletCard } from "../app/WalletCard";
import { Avatar } from "../ui/Avatar";
import { Headline } from "../ui/Headline";
import { PillButton, PillLink } from "../ui/PillButton";

/** /wallet: address, balances, QR. The only screen that shows wallet addresses. */
export function WalletScreen() {
  return (
    <AppShell>
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
    <AppShell>
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
