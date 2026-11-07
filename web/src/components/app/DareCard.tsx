"use client";

import { motion } from "motion/react";
import type { Actions } from "@/hooks/useActions";
import { formatWif, handle, timeAgo, timeLeft } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { springs } from "@/lib/motion";
import type { DareView } from "@/lib/types";
import { AvatarChip } from "../ui/Avatar";
import { Money, WIF_LABEL } from "../ui/Money";
import { PillButton, PillLink } from "../ui/PillButton";
import { StatusTag, tagFor } from "../ui/StatusTag";
import { DareText } from "./DareText";
import { HiddenNote } from "./Report";

function durationLabel(seconds: number) {
  if (seconds >= 86400 && seconds % 86400 === 0) return `${seconds / 86400}d`;
  return `${Math.round(seconds / 3600)}h`;
}

/** The one-line status note under a dare. */
export function dareNote(d: DareView, now = Date.now()): string {
  switch (tagFor(d.state, d.outcome)) {
    case "OPEN":
      return `${durationLabel(d.doDuration)} to do it once someone says aight bet`;
    case "AIGHT BET": {
      const left = timeLeft(d.proofDeadline, now);
      return left ? `${handle(d.doer)} has ${left} to post proof` : "time's up for proof";
    }
    case "VOTING": {
      const left = timeLeft(d.voteEnd, now);
      return left ? `proof is in. voting closes in ${left}` : "voting closed";
    }
    case "PASSED":
      return `it counts. ${handle(d.doer)} got ${formatWif(d.payout ?? "0")} · ${formatWif(d.burned ?? "0")} burned`;
    case "FAILED":
      return `nah. ${formatWif(d.payout ?? "0")} back to ${handle(d.creator)} · ${formatWif(d.burned ?? "0")} burned`;
    case "EXPIRED":
      return `no proof. all ${formatWif(d.payout ?? d.amount)} ${WIF_LABEL} back to ${handle(d.creator)}`;
    case "NO VOTES":
      return `nobody voted. bounty back to ${handle(d.creator)}.`;
    case "CANCELLED":
      return `called off. ${handle(d.creator)} got it all back`;
  }
}

function ProofMedia({ d }: { d: DareView }) {
  if (!d.proofUrl) {
    if (!d.mediaHidden) return null;
    return (
      <div className="relative -mx-2 -mt-2 mb-4 grid min-h-[140px] place-items-center rounded-[26px] border-[3px] border-line bg-inset p-6 text-center">
        <HiddenNote what="proof" />
      </div>
    );
  }
  const alt = `proof posted by ${handle(d.doer)}`;
  return (
    <div className="relative -mx-2 -mt-2 mb-4 overflow-hidden rounded-[26px] border-[3px] border-line bg-inset">
      {d.proofMime?.startsWith("video/") ? (
        <video src={d.proofUrl} controls muted playsInline preload="metadata" className="block max-h-[420px] w-full bg-black object-contain" aria-label={alt} />
      ) : (
        // eslint-disable-next-line @next/next/no-img-element -- proof media from Supabase storage
        <img src={d.proofUrl} alt={alt} loading="lazy" className="block max-h-[420px] w-full object-cover" />
      )}
      <StatusTag kind={tagFor(d.state, d.outcome)} className="absolute left-3 top-3" />
    </div>
  );
}

/** "2 of 3 say it counts" + a fill that springs (scaleX, transform only) when the count changes. */
export function VoteBar({ pass, fail, eligible }: { pass: number; fail: number; eligible: number }) {
  const ratio = eligible > 0 ? Math.min(1, pass / eligible) : 0;
  return (
    <div className="mt-3">
      <div className="flex justify-between text-[15px]">
        <span className="font-extrabold">
          {pass} of {eligible} say it counts
        </span>
        {fail > 0 && <span className="text-muted">{fail} said nah</span>}
      </div>
      <div
        className="mt-2 h-3.5 overflow-hidden rounded-full border-[3px] border-line bg-inset"
        role="progressbar"
        aria-label="votes that say it counts"
        aria-valuemin={0}
        aria-valuemax={eligible}
        aria-valuenow={pass}
      >
        <motion.div
          className="h-full origin-left bg-primary"
          initial={false}
          animate={{ scaleX: ratio }}
          transition={springs.smooth}
          style={{ originX: 0 }}
        />
      </div>
    </div>
  );
}

/** A dare on the group feed: media, text, who dared who, money, tag, time, inline actions. */
export function DareCard({ d, actions, now }: { d: DareView; actions: Actions; now: number }) {
  const mock = useMockMode();
  const busy = (key: string) => actions.busy === `${key}:${d.id}`;
  const anyBusy = actions.busy?.endsWith(`:${d.id}`) ?? false;
  const kind = tagFor(d.state, d.outcome);
  const ago = timeAgo(d.createdAt, now);
  const eligible = d.eligible ?? 0;

  return (
    <article id={`dare-${d.id}`} className="raised scroll-mt-6 p-4 tab:p-5" aria-label={`dare ${d.id}`}>
      <ProofMedia d={d} />
      {!d.proofUrl && !d.mediaHidden && (
        <div className="mb-3 flex items-center justify-between gap-2">
          <StatusTag kind={kind} />
          {ago && <span className="text-[13px] text-muted">{ago}</span>}
        </div>
      )}
      {d.textHidden ? <HiddenNote what="text" /> : <DareText text={d.text} />}
      <div className="mt-4 flex flex-wrap items-end justify-between gap-x-3 gap-y-3">
        <div className="flex items-end gap-2">
          <AvatarChip person={d.creator} />
          <span className="pb-2 text-[15px] text-muted">dared</span>
          <AvatarChip person={d.target} label={d.target ? undefined : "anyone"} />
        </div>
        <Money wei={d.amount} align="right" />
      </div>
      <p className="mt-3 text-[15px] text-muted">{dareNote(d, now)}</p>

      {kind === "VOTING" && eligible > 0 && <VoteBar pass={d.passVotes} fail={d.failVotes} eligible={eligible} />}

      {(d.canAccept || d.canVote || d.canSettle || d.canCancel || d.canSubmitProof) && (
        <div className="mt-4 flex flex-wrap gap-3">
          {d.canAccept && (
            <PillButton full loading={busy("acceptDare")} disabled={anyBusy} onClick={() => void actions.accept(d.id)}>
              aight bet
            </PillButton>
          )}
          {d.canSubmitProof && (
            <PillLink full href={withMock(`/d/${d.id}`, mock)}>
              post proof
            </PillLink>
          )}
          {d.canVote && (
            <div className="grid w-full grid-cols-2 gap-3">
              <PillButton loading={busy("vote")} disabled={anyBusy} onClick={() => void actions.vote(d.id, true)}>
                it counts
              </PillButton>
              <PillButton variant="danger" disabled={anyBusy} onClick={() => void actions.vote(d.id, false)}>
                nah
              </PillButton>
            </div>
          )}
          {d.canSettle && (
            <PillButton full variant="secondary" loading={busy("settle")} disabled={anyBusy} onClick={() => void actions.settle(d.id)}>
              settle it ({d.settleOutcome === "Passed" ? "it counts" : d.settleOutcome === "Failed" ? "nah" : d.settleOutcome === "NoVotes" ? "no votes" : "no proof"})
            </PillButton>
          )}
          {d.canCancel && (
            <PillButton full variant="ghost" loading={busy("cancelDare")} disabled={anyBusy} onClick={() => void actions.cancel(d.id)}>
              cancel and get it back
            </PillButton>
          )}
        </div>
      )}
      {d.hasVoted && kind === "VOTING" && <p className="mt-3 text-[15px] font-extrabold text-accent-2">you voted. waiting on the rest.</p>}
    </article>
  );
}
