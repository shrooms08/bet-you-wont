"use client";

import { useEffect, useState } from "react";
import { useNow } from "@/hooks/useNow";
import { useFeed, useLeaderboard, type Session } from "@/hooks/data";
import { HttpError } from "@/hooks/useByw";
import { useActions } from "@/hooks/useActions";
import { groupName } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import type { DareView, Feed } from "@/lib/types";
import { AppShell } from "../app/AppShell";
import { StaggerItem, StaggerList } from "../motion/Stagger";
import { InviteButton, MembersPanel, StatsPanel } from "../app/Crews";
import { StreakFlame } from "../app/People";
import { Medal } from "../app/Score";
import { DareCard } from "../app/DareCard";
import { WaitingCard, waitingItems } from "../app/WaitingCard";
import { AvatarChip } from "../ui/Avatar";
import { Headline } from "../ui/Headline";
import { PillLink } from "../ui/PillButton";
import { SectionLabel } from "../ui/RaisedCard";
import { EmptyState, Skeleton } from "../ui/States";

/** The group's dares that need something from this viewer, as home-style buckets. */
function waitingFor(dares: DareView[]) {
  return waitingItems({
    toAccept: dares.filter((d) => d.canAccept),
    toVote: dares.filter((d) => d.canVote),
    needsProof: dares.filter((d) => d.canSubmitProof),
    toSettle: dares.filter((d) => d.canSettle),
  });
}

function GroupMain({ s, groupId }: { s: Session; groupId: number }) {
  const feed = useFeed(s, groupId);
  const actions = useActions(s);
  const mock = useMockMode();
  const now = useNow();
  const [tab, setTab] = useState<"dares" | "leaderboard">("dares");

  // Jump to #dare-<id> once the feed has rendered (links from home's "vote").
  useEffect(() => {
    if (!feed.data || !window.location.hash) return;
    document.getElementById(window.location.hash.slice(1))?.scrollIntoView({ block: "start" });
  }, [feed.data]);

  if (feed.isLoading) return <Skeleton count={3} height={220} />;
  if (feed.error) {
    const notMember = feed.error instanceof HttpError && feed.error.status === 403;
    return (
      <EmptyState
        title={notMember ? "you're not in this wifie" : "couldn't load this wifie"}
        body={notMember ? "ask a friend in it for their invite link." : "check your connection and try again."}
      >
        <PillLink href={withMock("/wifies", mock)}>your wifies</PillLink>
      </EmptyState>
    );
  }
  const f = feed.data as Feed;
  const label = groupName(f.group.id, f.group.name);

  return (
    <div className="flex flex-col gap-6">
      <Headline line1={label} line2="the dare board." accent="violet" />
      <div className="flex flex-wrap items-end justify-between gap-3">
        <ul data-hscroll className="-mx-1 flex max-w-full gap-3 overflow-x-auto px-1 pb-1" aria-label={`${f.members.length} members`}>
          {f.members.map((m) => (
            <li key={m.wallet} className="shrink-0">
              <AvatarChip person={m} />
            </li>
          ))}
        </ul>
        <InviteButton code={f.group.inviteCode} groupLabel={label} />
      </div>

      <div className="flex gap-2 rounded-full border-[3px] border-line bg-surface p-1" role="tablist" aria-label="wifie view">
        {(["dares", "leaderboard"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 flex-1 rounded-full text-[16px] font-extrabold ${tab === t ? "bg-primary text-on-primary" : ""}`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === "leaderboard" ? (
        <LeaderboardPanel s={s} groupId={f.group.id} />
      ) : f.dares.length === 0 ? (
        <EmptyState title="no dares yet" body="bet you won't start one.">
          <PillLink href={withMock(`/new?group=${f.group.id}`, mock)}>start one</PillLink>
        </EmptyState>
      ) : (
        <StaggerList className="flex flex-col gap-5" aria-label="dares, newest first">
          {f.dares.map((d) => (
            <StaggerItem key={d.id}>
              <DareCard d={d} actions={actions} now={now} />
            </StaggerItem>
          ))}
        </StaggerList>
      )}
    </div>
  );
}

/** Points earned in this wifie, this week or all time; top 3 get medals. */
function LeaderboardPanel({ s, groupId }: { s: Session; groupId: number }) {
  const [period, setPeriod] = useState<"week" | "all">("week");
  const q = useLeaderboard(s, groupId, period);
  return (
    <section className="flex flex-col gap-4" aria-label="leaderboard">
      <div className="flex gap-2" role="radiogroup" aria-label="period">
        {(["week", "all"] as const).map((p) => (
          <button
            key={p}
            type="button"
            role="radio"
            aria-checked={period === p}
            onClick={() => setPeriod(p)}
            className={`press min-h-11 rounded-full border-[3px] px-4 text-[15px] font-extrabold ${period === p ? "border-primary bg-primary text-on-primary" : "border-line bg-surface"}`}
          >
            {p === "week" ? "this week" : "all time"}
          </button>
        ))}
      </div>
      {q.isLoading && <Skeleton count={3} height={64} />}
      <StaggerList key={period} className="flex flex-col gap-3">
        {(q.data?.rows ?? []).map((r) => (
          <StaggerItem key={r.person.wallet} className={`raised flex items-center gap-3 px-4 py-3 ${r.rank === 1 && r.points > 0 ? "!border-primary" : ""}`}>
            <Medal rank={r.rank} />
            <AvatarChip person={r.person} />
            <StreakFlame n={r.person.streak} />
            <span className="ml-auto font-display text-[22px] tracking-normal">{r.points.toLocaleString("en-US")}</span>
          </StaggerItem>
        ))}
      </StaggerList>
      <p className="text-[13px] text-muted">points are for bragging, not money. weeks run monday to sunday (UTC).</p>
    </section>
  );
}

function GroupRight({ s, groupId }: { s: Session; groupId: number }) {
  const feed = useFeed(s, groupId);
  const actions = useActions(s);
  if (!feed.data) return null;
  const f = feed.data;
  const label = groupName(f.group.id, f.group.name);
  const items = waitingFor(f.dares);
  const me = (s.address ?? "").toLowerCase();
  return (
    <>
      {items.length > 0 && (
        <section className="flex flex-col gap-4" aria-label="waiting on you in this wifie">
          <SectionLabel count={items.length}>waiting on you</SectionLabel>
          {items.slice(0, 3).map((item) => (
            <WaitingCard key={item.dare.id} item={item} me={me} actions={actions} />
          ))}
        </section>
      )}
      <MembersPanel title={`${label} · ${f.members.length}`} members={f.members} inviteCode={f.group.inviteCode} groupLabel={label} />
      <StatsPanel stats={f.stats} />
    </>
  );
}

export function GroupScreen({ groupId }: { groupId: number }) {
  return (
    <AppShell right={(s) => <GroupRight s={s} groupId={groupId} />}>
      {(s) => <GroupMain s={s} groupId={groupId} />}
    </AppShell>
  );
}
