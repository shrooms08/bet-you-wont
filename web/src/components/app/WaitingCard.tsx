"use client";

import type { Actions } from "@/hooks/useActions";
import { groupName, handle } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import type { DareView, Home } from "@/lib/types";
import { Avatar } from "../ui/Avatar";
import { Money } from "../ui/Money";
import { PillButton, PillLink } from "../ui/PillButton";
import { StatusTag, tagFor } from "../ui/StatusTag";
import { DareText } from "./DareText";

export type WaitingKind = "accept" | "vote" | "proof" | "settle";
export type WaitingItem = { kind: WaitingKind; dare: DareView };

/** Flattens /api/home's buckets into one list, one entry per dare (most urgent action wins). */
export function waitingItems(w: Home["waitingOnYou"] | undefined): WaitingItem[] {
  if (!w) return [];
  const seen = new Set<number>();
  const out: WaitingItem[] = [];
  const add = (kind: WaitingKind, list: DareView[]) => {
    for (const dare of list) {
      if (seen.has(dare.id)) continue;
      seen.add(dare.id);
      out.push({ kind, dare });
    }
  };
  add("proof", w.needsProof);
  add("vote", w.toVote);
  add("settle", w.toSettle);
  add("accept", w.toAccept);
  return out;
}

function headline(item: WaitingItem, me: string): string {
  const d = item.dare;
  switch (item.kind) {
    case "accept":
      return d.target?.wallet === me ? `${handle(d.creator)} dared you` : `${handle(d.creator)} dared anyone`;
    case "vote":
      return `${handle(d.doer)} posted proof`;
    case "proof":
      return "you said aight bet";
    case "settle":
      return "the votes are in";
  }
}

/** A "waiting on you" card on home: who/what, the dare, money, ONE clear action. */
export function WaitingCard({ item, me, actions }: { item: WaitingItem; me: string; actions: Actions }) {
  const mock = useMockMode();
  const d = item.dare;
  const person = item.kind === "vote" ? d.doer : item.kind === "proof" ? d.creator : d.creator;
  const busy = actions.busy?.endsWith(`:${d.id}`) ?? false;

  return (
    <article className="raised p-4 tab:p-5" aria-label={`dare ${d.id}`}>
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-2.5">
          <Avatar person={person} size={36} />
          <span className="truncate text-[15px] font-extrabold">{headline(item, me)}</span>
        </span>
        <StatusTag kind={tagFor(d.state, d.outcome)} />
      </div>
      <div className="mt-3 flex gap-3">
        <DareText text={d.text} size="sm" className="min-w-0 flex-1" />
        {d.proofUrl && !d.proofMime?.startsWith("video/") && (
          // eslint-disable-next-line @next/next/no-img-element -- proof thumbnail
          <img src={d.proofUrl} alt={`proof from ${handle(d.doer)}`} className="h-16 w-16 shrink-0 rounded-2xl border-[3px] border-line object-cover" />
        )}
      </div>
      <p className="mt-1 text-[13px] text-muted">in {groupName(d.groupId, d.groupName)}</p>
      <div className="mt-3 flex items-end justify-between gap-3">
        <Money wei={d.amount} />
        {item.kind === "accept" && (
          <PillButton loading={actions.busy === `acceptDare:${d.id}`} disabled={busy} onClick={() => void actions.accept(d.id)}>
            aight bet
          </PillButton>
        )}
        {item.kind === "vote" && <PillLink href={withMock(`/g/${d.groupId}#dare-${d.id}`, mock)}>vote</PillLink>}
        {item.kind === "proof" && <PillLink href={withMock(`/d/${d.id}`, mock)}>post proof</PillLink>}
        {item.kind === "settle" && (
          <PillButton variant="secondary" loading={actions.busy === `settle:${d.id}`} disabled={busy} onClick={() => void actions.settle(d.id)}>
            settle
          </PillButton>
        )}
      </div>
    </article>
  );
}
