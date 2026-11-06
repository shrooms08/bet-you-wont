"use client";

import { useRouter } from "next/navigation";
import { useFeed, useHome, type Session } from "@/hooks/data";
import { useActions } from "@/hooks/useActions";
import { groupName } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { AppShell } from "../app/AppShell";
import { StaggerItem, StaggerList } from "../motion/Stagger";
import { CrewCard, JoinPublicCard, MembersPanel, StartGroupCard, StatsPanel } from "../app/Crews";
import { WaitingCard, waitingItems } from "../app/WaitingCard";
import { Headline } from "../ui/Headline";
import { PillLink } from "../ui/PillButton";
import { SectionLabel } from "../ui/RaisedCard";
import { EmptyState, Skeleton } from "../ui/States";

function HomeMain({ s }: { s: Session }) {
  const home = useHome(s);
  const actions = useActions(s);
  const router = useRouter();
  const mock = useMockMode();
  const items = waitingItems(home.data?.waitingOnYou);
  const groups = home.data?.groups ?? [];
  const me = (s.address ?? "").toLowerCase();
  const openGroup = (id: number) => router.push(withMock(`/g/${id}`, mock));

  return (
    <div className="flex flex-col gap-6">
      <Headline line1="what's the" line2="dare today?" accent="lime" />
      {(home.isLoading || items.length > 0 || groups.length > 0) && (
      <section className="flex flex-col gap-4" aria-label="waiting on you">
        <SectionLabel count={items.length}>waiting on you</SectionLabel>
        {home.isLoading && <Skeleton count={2} />}
        {home.error && <EmptyState title="couldn't load your dares" body="check your connection. we'll keep trying." />}
        {home.isSuccess && items.length === 0 && groups.length > 0 && (
          <EmptyState title="nothing waiting on you" body="suspicious. go dare someone.">
            <PillLink href={withMock("/new", mock)}>new dare</PillLink>
          </EmptyState>
        )}
        <StaggerList as="div" className="flex flex-col gap-4">
          {items.map((item) => (
            <StaggerItem as="div" key={item.dare.id}>
              <WaitingCard item={item} me={me} actions={actions} />
            </StaggerItem>
          ))}
        </StaggerList>
      </section>
      )}

      <section className="flex flex-col gap-4" aria-label="your crews">
        <SectionLabel>your crews</SectionLabel>
        {home.isSuccess && groups.length === 0 ? (
          <>
            <EmptyState title="no crew yet" body="dares need friends. start your own crew or jump into the public one." />
            <JoinPublicCard s={s} actions={actions} onJoined={openGroup} />
            <StartGroupCard actions={actions} onCreated={openGroup} />
          </>
        ) : (
          <StaggerList as="div" className="flex flex-col gap-4">
            {groups.map((g) => (
              <StaggerItem as="div" key={g.id}>
                <CrewCard g={g} />
              </StaggerItem>
            ))}
          </StaggerList>
        )}
      </section>
    </div>
  );
}

/** Desktop right column on home: the busiest crew's members and live stats. */
function HomeRight({ s }: { s: Session }) {
  const home = useHome(s);
  const top = [...(home.data?.groups ?? [])].sort((a, b) => b.liveDareCount - a.liveDareCount)[0];
  const feed = useFeed(s, top?.id ?? null);
  if (!top || !feed.data) return null;
  const label = groupName(top.id, feed.data.group.name);
  return (
    <>
      <MembersPanel
        title={`${label} · ${feed.data.members.length}`}
        members={feed.data.members}
        inviteCode={feed.data.group.inviteCode}
        groupLabel={label}
      />
      <StatsPanel stats={feed.data.stats} />
    </>
  );
}

export function HomeScreen() {
  return <AppShell right={(s) => <HomeRight s={s} />}>{(s) => <HomeMain s={s} />}</AppShell>;
}
