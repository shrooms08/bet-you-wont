"use client";

import { motion } from "motion/react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { formatUnits } from "viem";
import { useDare, useReaction, type Session } from "@/hooks/data";
import { HttpError } from "@/hooks/useByw";
import { useActions } from "@/hooks/useActions";
import { useNow } from "@/hooks/useNow";
import { groupName, handle, timeLeft } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { springs } from "@/lib/motion";
import type { DareDetail } from "@/lib/types";
import { AppShell } from "../app/AppShell";
import { StreakFlame } from "../app/People";
import { ScorePop } from "../app/Score";
import { VoteBar } from "../app/DareCard";
import { DareText } from "../app/DareText";
import { ProofFlow } from "../camera/ProofFlow";
import { AutoVideo, ReactionButton, resultLine, ShareButton } from "../dare/bits";
import { CountdownCircle } from "../dare/CountdownCircle";
import { DoubleTapBurst } from "../motion/DoubleTapBurst";
import { StampSlam, type StampOutcome } from "../motion/StampSlam";
import { Avatar, AvatarChip } from "../ui/Avatar";
import { ChevronRightIcon } from "../ui/icons";
import { Money } from "../ui/Money";
import { PillButton, PillLink } from "../ui/PillButton";
import { EmptyState, Skeleton } from "../ui/States";
import { StatusTag, tagFor } from "../ui/StatusTag";
import { HiddenNote, ReportButton } from "../app/Report";

/** Slam the stamp only the first time someone sees a dare settled (remembered per dare). */
function useFirstSettledView(dareId: number, settled: boolean) {
  const [slam, setSlam] = useState(false);
  useEffect(() => {
    if (!settled) return;
    const key = `byw:stamped:${dareId}`;
    let seen = false;
    try {
      seen = window.localStorage.getItem(key) === "1";
      window.localStorage.setItem(key, "1");
    } catch {
      // storage blocked (private mode): just slam
    }
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once
    setSlam(!seen);
  }, [dareId, settled]);
  return slam;
}

function durationLabel(seconds: number) {
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400} day${seconds === 86400 ? "" : "s"}`;
  return `${Math.round(seconds / 3600)} hour${seconds === 3600 ? "" : "s"}`;
}

function DareMain({ s, dareId }: { s: Session; dareId: number }) {
  const q = useDare(s, dareId);
  const actions = useActions(s);
  const react = useReaction(s);
  const router = useRouter();
  const mock = useMockMode();
  const now = useNow(1000 * 15);
  const [camera, setCamera] = useState(false);
  const data = q.data as DareDetail | undefined;
  const d = data?.dare;
  const kind = d ? tagFor(d.state, d.outcome) : null;
  const settled = kind === "PASSED" || kind === "FAILED" || kind === "EXPIRED" || kind === "NO VOTES";
  const slam = useFirstSettledView(dareId, settled);

  if (q.isLoading) return <Skeleton count={2} height={260} />;
  if (q.error || !data || !d || !kind) {
    const status = q.error instanceof HttpError ? q.error.status : 0;
    const msg = q.error instanceof Error ? q.error.message : "";
    return (
      <EmptyState
        title={status === 404 && msg.includes("private") ? "this dare is private" : status === 404 ? "no such dare" : "couldn't load this dare"}
        body={status === 404 && msg.includes("private") ? "only people in its wifie can see it." : "check the link, or try again in a moment."}
      >
        <PillLink href={withMock("/home", mock)}>home</PillLink>
      </EmptyState>
    );
  }

  const crew = groupName(data.group.id, data.group.name);
  const busyHere = actions.busy?.endsWith(`:${d.id}`) ?? false;
  const doerIsMe = d.doer?.wallet === data.viewer;
  const canReact = data.member || data.group.isPublic; // same rule as POST /api/reactions
  const target = d.target ? handle(d.target) : "anyone in the wifie";
  const payoutTokens = d.payout ? Math.round(Number(formatUnits(BigInt(d.payout), 18))) : null;

  return (
    <div className="flex flex-col gap-6">
      {/* header */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={() => (window.history.length > 1 ? router.back() : router.push(withMock("/home", mock)))}
          aria-label="back"
          className="press grid h-12 w-12 shrink-0 place-items-center rounded-full border-[3px] border-line bg-surface"
        >
          <ChevronRightIcon size={18} className="rotate-180" />
        </button>
        <p className="min-w-0 flex-1 truncate text-[17px] font-extrabold">
          <span className="text-muted">dare #{d.id} in </span>
          {crew}
        </p>
        <StatusTag kind={kind} />
        <ReportButton s={s} dareId={d.id} hasProof={!!d.proofHash || !!d.proofUrl} className="h-12 w-12" />
      </div>

      {!data.member && (
        <div className="raised flex flex-wrap items-center justify-between gap-3 !border-primary p-4" role="note">
          <p className="text-[15px] font-extrabold">you&apos;re watching. join {crew} to dare and vote.</p>
          <PillButton size="sm" loading={actions.busy === `join:${data.group.id}`} onClick={() => void actions.joinGroup(data.group.id).then((ok) => ok && q.refetch())}>
            join the wifie
          </PillButton>
        </div>
      )}

      {/* ---------------- VOTING / RESULT with proof: media first ---------------- */}
      {d.proofUrl && (kind === "VOTING" || settled) && (
        <div className="relative">
          <DoubleTapBurst onReact={() => canReact && !d.reacted && react.mutate(d.id)} className="overflow-hidden rounded-[28px] border-[3px] border-line bg-black">
            {d.proofKind === "video" || d.proofMime?.startsWith("video/") ? (
              <AutoVideo src={d.proofUrl} poster={d.posterUrl} controls label={`proof clip from ${handle(d.doer)}`} className="block max-h-[70vh] w-full" />
            ) : (
              // eslint-disable-next-line @next/next/no-img-element -- proof photo from storage (receipt burned in)
              <img src={d.proofUrl} alt={`proof photo from ${handle(d.doer)}`} className="block max-h-[70vh] w-full object-contain" />
            )}
          </DoubleTapBurst>
          {settled && slam && (
            <div className="pointer-events-none absolute -bottom-10 right-0">
              <StampSlam outcome={kind as StampOutcome} size={150} />
            </div>
          )}
        </div>
      )}

      {!d.proofUrl && d.proofHash && (kind === "VOTING" || settled) && (
        <div className="grid min-h-[200px] place-items-center rounded-[28px] border-[3px] border-line bg-inset p-6 text-center">
          {d.mediaHidden ? <HiddenNote what="proof" /> : <p className="text-[15px] font-extrabold text-muted">proof missing</p>}
        </div>
      )}

      {d.textHidden ? <HiddenNote what="text" /> : <DareText text={d.text} size="lg" />}

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="flex items-end gap-2">
          <AvatarChip person={d.creator} />
          <span className="pb-2 text-[15px] text-muted">dared</span>
          <AvatarChip person={d.target} label={d.target ? undefined : "anyone"} />
        </div>
        <Money wei={d.amount} size="lg" align="right" />
      </div>

      {/* ---------------- OPEN ---------------- */}
      {kind === "OPEN" && (
        <section className="flex flex-col gap-4" aria-label="open dare">
          <p className="text-[16px] text-muted">
            {target} gets {durationLabel(d.doDuration)} to do it once they say aight bet.
          </p>
          {d.canAccept && (
            <PillButton full size="lg" className="min-h-[76px] font-display text-[30px] uppercase tracking-normal" loading={actions.busy === `acceptDare:${d.id}`} disabled={busyHere} onClick={() => void actions.accept(d.id)}>
              aight bet
            </PillButton>
          )}
          {d.canCancel && (
            <PillButton full variant="ghost" loading={actions.busy === `cancelDare:${d.id}`} disabled={busyHere} onClick={() => void actions.cancel(d.id)}>
              cancel dare
            </PillButton>
          )}
        </section>
      )}

      {/* ---------------- ACCEPTED: the countdown circle ---------------- */}
      {kind === "AIGHT BET" && (
        <section className="flex flex-col items-center gap-4" aria-label="time to post proof">
          <CountdownCircle
            start={d.acceptedAt ?? null}
            end={d.proofDeadline}
            now={now}
            center={<Avatar person={d.doer} size={120} />}
            bubble={
              d.canSubmitProof ? (
                <motion.button
                  type="button"
                  onClick={() => setCamera(true)}
                  whileHover={{ y: -2 }}
                  whileTap={{ y: 3 }}
                  transition={springs.snappy}
                  className="press-lip relative rounded-full border-[3px] border-line bg-primary px-6 py-3 font-display text-[22px] uppercase tracking-normal text-on-primary after:absolute after:left-1/2 after:top-full after:h-4 after:w-4 after:-translate-x-1/2 after:-translate-y-2 after:rotate-45 after:border-b-[3px] after:border-r-[3px] after:border-line after:bg-primary"
                >
                  post proof
                </motion.button>
              ) : undefined
            }
          />
          {!doerIsMe && <p className="text-[18px] font-extrabold">{handle(d.doer)} is on it</p>}
          {d.canSubmitProof && <p className="text-[14px] text-muted">proof is shot live in the app. no camera roll.</p>}
          {d.canSettle && (
            <PillButton full variant="secondary" loading={actions.busy === `settle:${d.id}`} disabled={busyHere} onClick={() => void actions.settle(d.id)}>
              time&apos;s up: settle (refund)
            </PillButton>
          )}
        </section>
      )}

      {/* ---------------- VOTING ---------------- */}
      {kind === "VOTING" && (
        <section className="flex flex-col gap-4" aria-label="voting">
          <VoteBar pass={d.passVotes} fail={d.failVotes} eligible={d.eligible ?? 0} />
          {data.voters.length > 0 && (
            <ul className="flex flex-wrap gap-2" aria-label="who voted">
              {data.voters.map((v) => (
                <li key={v.wallet} className="flex items-center gap-1.5 rounded-full border-[3px] border-line bg-surface py-0.5 pl-0.5 pr-3 text-[14px] font-extrabold">
                  <Avatar person={v} size={28} />
                  {v.pass ? "it counts" : "nah"}
                </li>
              ))}
            </ul>
          )}
          <p className="text-[15px] text-muted">{timeLeft(d.voteEnd, now) ? `voting closes in ${timeLeft(d.voteEnd, now)}` : "voting closed"}</p>
          {d.canVote && (
            <div className="grid grid-cols-2 gap-3">
              <PillButton size="lg" loading={actions.busy === `vote:${d.id}`} disabled={busyHere} onClick={() => void actions.vote(d.id, true)}>
                it counts
              </PillButton>
              <PillButton size="lg" variant="danger" disabled={busyHere} onClick={() => void actions.vote(d.id, false)}>
                nah
              </PillButton>
            </div>
          )}
          {d.hasVoted && <p className="text-[15px] font-extrabold text-accent-2">you voted. waiting on the rest.</p>}
          {d.canSettle && (
            <PillButton full variant="secondary" loading={actions.busy === `settle:${d.id}`} disabled={busyHere} onClick={() => void actions.settle(d.id)}>
              settle it
            </PillButton>
          )}
        </section>
      )}

      {/* ---------------- RESULT ---------------- */}
      {settled && (
        <section className="flex flex-col gap-4" aria-label="result">
          {!d.proofUrl && slam && (
            <div className="grid place-items-center py-2">
              <StampSlam outcome={kind as StampOutcome} size={170} />
            </div>
          )}
          <div className={`flex flex-col gap-3 ${d.proofUrl ? "pt-6" : ""}`}>
            <ScorePop points={data.myPoints ?? 0} />
            <p className="text-[22px] font-extrabold leading-tight tracking-[-0.04em]">
              {resultLine(d)} {d.outcome === "Passed" && <StreakFlame n={d.doer?.streak} />}
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ShareButton s={s} dareId={d.id} text={d.text} label />
            <PillLink href={withMock(`/new?group=${data.group.id}${payoutTokens ? `&amount=${payoutTokens}` : ""}`, mock)} variant="secondary" size="sm">
              re-dare
            </PillLink>
          </div>
        </section>
      )}

      {kind === "CANCELLED" && <p className="raised p-5 text-[17px]">{resultLine(d)}</p>}

      {/* reactions (any state with proof) */}
      {d.proofUrl && (
        <div className="flex items-center gap-3">
          <ReactionButton reacted={!!d.reacted} count={d.reactionCount ?? 0} disabled={!canReact} onToggle={() => react.mutate(d.id)} />
          {!settled && <ShareButton s={s} dareId={d.id} text={d.text} />}
        </div>
      )}

      {camera && <ProofFlow s={s} actions={actions} dareId={d.id} onClose={() => setCamera(false)} />}
    </div>
  );
}

export function DareDetailScreen({ dareId }: { dareId: number }) {
  return <AppShell>{(s) => <DareMain s={s} dareId={dareId} />}</AppShell>;
}
