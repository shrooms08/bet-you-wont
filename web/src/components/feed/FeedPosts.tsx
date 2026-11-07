"use client";

import Link from "next/link";
import { useEffect, useRef } from "react";
import { useFeedPosts, useReaction, type Session } from "@/hooks/data";
import type { Actions } from "@/hooks/useActions";
import { groupName, handle, PUBLIC_GROUP_ID, timeAgo } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import type { Story } from "@/lib/stories";
import type { FeedItem } from "@/lib/types";
import { VoteBar } from "../app/DareCard";
import { PersonLink, StreakFlame } from "../app/People";
import { DareText } from "../app/DareText";
import { AutoVideo, ReactionButton, resultLine, ShareButton } from "../dare/bits";
import { DoubleTapBurst } from "../motion/DoubleTapBurst";
import { StaggerItem, StaggerList } from "../motion/Stagger";
import { Avatar } from "../ui/Avatar";
import { PlusIcon } from "../ui/icons";
import { Money } from "../ui/Money";
import { PillButton, PillLink } from "../ui/PillButton";
import { Skeleton } from "../ui/States";
import { StatusTag, tagFor } from "../ui/StatusTag";

/** Round bubbles for everything waiting on you. First is always "+ new dare". */
export function StoriesRow({ stories }: { stories: Story[] }) {
  const mock = useMockMode();
  return (
    <ul
      data-hscroll
      className="-mx-4 flex gap-4 overflow-x-auto px-4 pb-1 pt-1 [mask-image:linear-gradient(to_right,#000_calc(100%-32px),transparent)] [scrollbar-width:none] tab:-mx-0 tab:px-0"
      aria-label="waiting on you"
    >
      <li className="shrink-0">
        <Link href={withMock("/new", mock)} className="flex w-[72px] flex-col items-center gap-1.5" aria-label="new dare">
          <span className="grid h-[68px] w-[68px] place-items-center rounded-full border-[3px] border-dashed border-primary bg-surface text-primary">
            <PlusIcon size={30} />
          </span>
          <span className="text-[13px] font-extrabold">new dare</span>
        </Link>
      </li>
      {stories.map((st) => (
        <li key={st.dare.id} className="shrink-0">
          <Link href={withMock(`/d/${st.dare.id}`, mock)} className="flex w-[72px] flex-col items-center gap-1.5" aria-label={`${st.label}: dare ${st.dare.id}`}>
            <span className="grid h-[68px] w-[68px] place-items-center rounded-full p-[4px]" style={{ background: st.ring }}>
              <span className="grid h-full w-full place-items-center rounded-full bg-bg p-[2px]">
                <Avatar person={st.person ? { ...st.person, ringColor: "transparent" } : null} size={54} />
              </span>
            </span>
            <span className="text-[13px] font-extrabold">{st.label}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function PostHeader({ it, now }: { it: FeedItem; now: number }) {
  const who = it.post === "media" ? it.doer : it.creator;
  return (
    <div className="flex items-center justify-between gap-3 px-1">
      <span className="flex min-w-0 items-center gap-2.5">
        <PersonLink username={who?.username}>
          <Avatar person={who} size={36} />
        </PersonLink>
        <span className="min-w-0 leading-tight">
          <span className="flex items-center gap-1.5">
            <PersonLink username={who?.username} className="truncate text-[15px] font-extrabold">
              {handle(who)}
            </PersonLink>
            <StreakFlame n={who?.streak} />
          </span>
          <span className="block truncate text-[13px] text-muted">
            in {groupName(it.groupId, it.groupName)}
            {timeAgo(it.activityAt ?? it.createdAt, now) ? ` · ${timeAgo(it.activityAt ?? it.createdAt, now)}` : ""}
          </span>
        </span>
      </span>
      <StatusTag kind={tagFor(it.state, it.outcome)} />
    </div>
  );
}

/** A proof post: 4:5 media with double-tap 🔥, action row, caption, inline voting or result. */
function MediaPost({ it, s, actions, now }: { it: FeedItem; s: Session; actions: Actions; now: number }) {
  const mock = useMockMode();
  const react = useReaction(s);
  const busy = actions.busy?.endsWith(`:${it.id}`) ?? false;
  const kind = tagFor(it.state, it.outcome);
  const isVideo = it.proofKind === "video" || it.proofMime?.startsWith("video/");
  // anyone who can see a dare can 🔥 it: crew members, or anyone for the public crew
  const canReact = it.member || it.groupId === PUBLIC_GROUP_ID;
  return (
    <article className="flex flex-col gap-3" aria-label={`proof for dare ${it.id}`}>
      <PostHeader it={it} now={now} />
      <DoubleTapBurst onReact={() => canReact && !it.reacted && react.mutate(it.id)} className="overflow-hidden rounded-[28px] border-[3px] border-line bg-black">
        <div className="aspect-[4/5] w-full">
          {isVideo ? (
            <AutoVideo src={it.proofUrl!} poster={it.posterUrl} label={`proof clip from ${handle(it.doer)}`} className="h-full w-full object-cover" />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element -- proof photo from storage
            <img src={it.proofUrl!} alt={`proof photo from ${handle(it.doer)}`} loading="lazy" className="h-full w-full object-cover" draggable={false} />
          )}
        </div>
      </DoubleTapBurst>
      <div className="flex items-center gap-2 px-1">
        <ReactionButton reacted={!!it.reacted} count={it.reactionCount ?? 0} disabled={!canReact} onToggle={() => react.mutate(it.id)} />
        <ShareButton s={s} dareId={it.id} text={it.text} />
        <span className="ml-auto">
          <Money wei={it.amount} size="sm" align="right" />
        </span>
      </div>
      <Link href={withMock(`/d/${it.id}`, mock)} className="px-1 text-[16px] leading-snug">
        <b>{handle(it.creator)}</b> <span className="text-muted">dared</span> <b>{handle(it.doer ?? it.target)}</b> <span className="text-muted">to</span> {it.text}
      </Link>
      {kind === "VOTING" && (
        <div className="px-1">
          <VoteBar pass={it.passVotes} fail={it.failVotes} eligible={it.eligible ?? 0} />
          {it.canVote && (
            <div className="mt-3 grid grid-cols-2 gap-3">
              <PillButton loading={actions.busy === `vote:${it.id}`} disabled={busy} onClick={() => void actions.vote(it.id, true)}>
                it counts
              </PillButton>
              <PillButton variant="danger" disabled={busy} onClick={() => void actions.vote(it.id, false)}>
                nah
              </PillButton>
            </div>
          )}
          {it.canSettle && (
            <PillButton full variant="secondary" className="mt-3" loading={actions.busy === `settle:${it.id}`} disabled={busy} onClick={() => void actions.settle(it.id)}>
              settle it
            </PillButton>
          )}
        </div>
      )}
      {kind !== "VOTING" && <p className="px-1 text-[15px] font-extrabold text-accent-2">{resultLine(it)}</p>}
    </article>
  );
}

/** An open dare: big text, bounty, who, time, and "AIGHT BET" when you can take it. */
function ChallengePost({ it, actions, now }: { it: FeedItem; actions: Actions; now: number }) {
  const mock = useMockMode();
  const hours = it.doDuration >= 86400 ? `${Math.round(it.doDuration / 86400)}d` : `${Math.round(it.doDuration / 3600)}h`;
  return (
    <article className="raised flex flex-col gap-4 p-5" aria-label={`open dare ${it.id}`}>
      <PostHeader it={it} now={now} />
      <Link href={withMock(`/d/${it.id}`, mock)}>
        <DareText text={it.text} size="lg" />
      </Link>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <p className="text-[15px]">
          <b>{handle(it.creator)}</b> <span className="text-muted">dared</span> <b>{it.target ? handle(it.target) : "anyone"}</b>
          <span className="block text-[13px] text-muted">{hours} to do it once accepted</span>
        </p>
        <Money wei={it.amount} size="lg" align="right" />
      </div>
      {it.canAccept ? (
        <PillButton full size="lg" className="font-display text-[22px] uppercase tracking-normal" loading={actions.busy === `acceptDare:${it.id}`} onClick={() => void actions.accept(it.id)}>
          aight bet
        </PillButton>
      ) : (
        <PillLink href={withMock(`/d/${it.id}`, mock)} variant="ghost" full>
          {it.member ? "see dare" : "watch this dare"}
        </PillLink>
      )}
    </article>
  );
}

/** The infinite feed (10 per page, loads more when the sentinel scrolls into view). */
export function FeedList({ s, actions, now, empty }: { s: Session; actions: Actions; now: number; empty: React.ReactNode }) {
  const q = useFeedPosts(s);
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasNextPage, isFetchingNextPage, fetchNextPage } = q;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasNextPage) return;
    const io = new IntersectionObserver(([e]) => e.isIntersecting && !isFetchingNextPage && void fetchNextPage(), { rootMargin: "600px 0px" });
    io.observe(el);
    return () => io.disconnect();
  }, [hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (q.isLoading) return <Skeleton count={2} height={420} />;
  const items = q.data?.pages.flatMap((p) => p.items) ?? [];
  if (!items.length) return <>{empty}</>;
  return (
    <>
      <StaggerList className="flex flex-col gap-10" aria-label="feed">
        {items.map((it) => (
          <StaggerItem key={it.id}>{it.post === "media" ? <MediaPost it={it} s={s} actions={actions} now={now} /> : <ChallengePost it={it} actions={actions} now={now} />}</StaggerItem>
        ))}
      </StaggerList>
      <div ref={sentinel} aria-hidden />
      {isFetchingNextPage && <Skeleton count={1} height={420} />}
      {!hasNextPage && items.length > 3 && <p className="py-6 text-center text-[14px] text-muted">you&apos;re all caught up.</p>}
    </>
  );
}
