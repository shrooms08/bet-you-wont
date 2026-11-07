"use client";

import Link from "next/link";
import { Logo } from "@/components/brand/Logo";
import { useRouter } from "next/navigation";
import { useBalances, useHome, type Session } from "@/hooks/data";
import { useActions } from "@/hooks/useActions";
import { useNow } from "@/hooks/useNow";
import { formatWif } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { storiesFrom } from "@/lib/stories";
import { AppShell } from "../app/AppShell";
import { CrewCard, JoinPublicCard, StartGroupCard } from "../app/Crews";
import { StreakBanner } from "../app/Score";
import { WaitingCard, waitingItems } from "../app/WaitingCard";
import { FeedList, StoriesRow } from "../feed/FeedPosts";
import { PillLink } from "../ui/PillButton";
import { SectionLabel } from "../ui/RaisedCard";
import { EmptyState } from "../ui/States";

function TopBar({ s }: { s: Session }) {
  const mock = useMockMode();
  const balances = useBalances(s);
  return (
    <div className="flex items-center justify-between gap-3">
      <Link href={withMock("/home", mock)} className="flex items-center gap-2.5 font-display text-[30px] uppercase leading-none tracking-[-0.03em] text-accent-2 desk:invisible" aria-label="bet you won't home">
        <Logo size={30} decorative />
        BYW
      </Link>
      <Link href={withMock("/wallet", mock)} className="press flex min-h-11 items-center gap-1.5 rounded-full border-[3px] border-line bg-surface px-4 text-[15px] font-extrabold" aria-label="your wallet balance">
        <span className="text-money">{balances.wif !== undefined ? formatWif(balances.wif) : "…"}</span> $wif
      </Link>
    </div>
  );
}

function HomeMain({ s }: { s: Session }) {
  const home = useHome(s);
  const actions = useActions(s);
  const router = useRouter();
  const mock = useMockMode();
  const now = useNow();
  const stories = storiesFrom(home.data?.waitingOnYou);
  const groups = home.data?.groups ?? [];
  const openGroup = (id: number) => router.push(withMock(`/g/${id}`, mock));

  return (
    <div className="mx-auto flex w-full max-w-[600px] flex-col gap-6">
      <TopBar s={s} />
      <StreakBanner s={s} actions={actions} now={now} />
      <StoriesRow stories={stories} />
      <FeedList
        s={s}
        actions={actions}
        now={now}
        empty={
          home.isSuccess && groups.length === 0 ? (
            <div className="flex flex-col gap-5">
              <EmptyState title="no wifie yet" body="dares need friends. start your own wifie or jump into the public one." />
              <JoinPublicCard s={s} actions={actions} onJoined={openGroup} />
              <StartGroupCard actions={actions} onCreated={openGroup} />
            </div>
          ) : (
            <EmptyState title="nothing here yet" body="suspicious. go dare someone.">
              <PillLink href={withMock("/new", mock)}>new dare</PillLink>
            </EmptyState>
          )
        }
      />
    </div>
  );
}

/** Desktop right column: "waiting on you" list and your wifies. */
function HomeRight({ s }: { s: Session }) {
  const home = useHome(s);
  const actions = useActions(s);
  const items = waitingItems(home.data?.waitingOnYou);
  const me = (s.address ?? "").toLowerCase();
  return (
    <>
      {items.length > 0 && (
        <section className="flex flex-col gap-4" aria-label="waiting on you">
          <SectionLabel count={items.length}>waiting on you</SectionLabel>
          {items.slice(0, 3).map((item) => (
            <WaitingCard key={item.dare.id} item={item} me={me} actions={actions} />
          ))}
        </section>
      )}
      {(home.data?.groups.length ?? 0) > 0 && (
        <section className="flex flex-col gap-3" aria-label="your wifies">
          <SectionLabel>your wifies</SectionLabel>
          {home.data!.groups.map((g) => (
            <CrewCard key={g.id} g={g} />
          ))}
        </section>
      )}
    </>
  );
}

export function HomeScreen() {
  return <AppShell right={(s) => <HomeRight s={s} />}>{(s) => <HomeMain s={s} />}</AppShell>;
}
