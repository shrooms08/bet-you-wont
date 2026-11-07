"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import type { Session } from "@/hooks/data";
import { useNow } from "@/hooks/useNow";
import { HttpError } from "@/hooks/useByw";
import { describeError } from "@/lib/errors";
import { groupName, handle, timeAgo } from "@/lib/format";
import { MOCK_ADMIN } from "@/lib/fixtures";
import { plainError } from "@/lib/plainErrors";
import type { AdminData, AdminItem } from "@/lib/types";
import { AppShell } from "../app/AppShell";
import { DareText } from "../app/DareText";
import { REPORT_REASONS } from "../app/Report";
import { Headline } from "../ui/Headline";
import { PillButton } from "../ui/PillButton";
import { EmptyState, Skeleton } from "../ui/States";

const REASON = Object.fromEntries(REPORT_REASONS) as Record<string, string>;
type Action = "hide_media" | "unhide_media" | "hide_text" | "unhide_text" | "delete_proof" | "block_profile" | "unblock_profile" | "delete_profile";

function useAdmin(s: Session) {
  return useQuery({
    queryKey: ["admin", s.mock || s.address],
    queryFn: () => (s.mock ? Promise.resolve(MOCK_ADMIN) : s.byw.api<AdminData>("/api/admin/reports")),
    retry: (count, err) => !(err instanceof HttpError && err.status === 403) && count < 1,
  });
}

function ReportedDare({ it, run, busy, now }: { it: AdminItem; run: (a: Action, target: { dareId?: number; wallet?: string }) => void; busy: string | null; now: number }) {
  const [confirm, setConfirm] = useState<null | "delete_proof" | "delete_profile">(null);
  const b = (a: Action) => busy === `${a}:${it.dareId}`;
  const doer = it.doer?.wallet ?? null;
  return (
    <article className="raised flex flex-col gap-4 p-5" aria-label={`reported dare ${it.dareId}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-[15px] font-extrabold">
          dare #{it.dareId} <span className="text-muted">in {groupName(it.groupId, it.groupName)}</span> {it.isPublic && <span className="text-muted">(public)</span>}
        </p>
        <p className="text-[13px] text-muted">{it.reports.length} report{it.reports.length === 1 ? "" : "s"}</p>
      </div>

      {it.proofUrl ? (
        it.proofKind === "video" ? (
          <video src={it.proofUrl} poster={it.posterUrl ?? undefined} controls muted playsInline className="max-h-[320px] w-full rounded-[20px] border-[3px] border-line bg-black" />
        ) : (
          // eslint-disable-next-line @next/next/no-img-element -- proof under review (signed URL)
          <img src={it.proofUrl} alt={`proof for dare ${it.dareId}`} className="max-h-[320px] w-full rounded-[20px] border-[3px] border-line object-contain" />
        )
      ) : (
        <p className="text-[14px] text-muted">{it.hasProof ? "proof file missing or deleted" : "no proof"}</p>
      )}
      <DareText text={it.text} size="sm" />
      <p className="text-[14px] text-muted">
        {handle(it.creator)} dared {handle(it.doer)} · text {it.textHidden ? `hidden (${it.textHidden.by})` : "visible"} · media {it.mediaHidden ? `hidden (${it.mediaHidden.by})` : "visible"}
      </p>

      <ul className="flex flex-col gap-2">
        {it.reports.map((r) => (
          <li key={r.id} className="rounded-[16px] border-[3px] border-line px-3 py-2 text-[14px]">
            <b>{r.target === "proof" ? "proof" : "dare"}</b>: {REASON[r.reason] ?? r.reason} <span className="text-muted">· {handle(r.reporter)} · {timeAgo(r.at, now) || "just now"}</span>
            {r.details && <span className="block text-muted">“{r.details}”</span>}
          </li>
        ))}
      </ul>

      <div className="flex flex-wrap gap-2">
        {it.hasProof &&
          (it.mediaHidden ? (
            <PillButton size="sm" variant="secondary" loading={b("unhide_media")} onClick={() => run("unhide_media", { dareId: it.dareId })}>
              unhide media
            </PillButton>
          ) : (
            <PillButton size="sm" variant="secondary" loading={b("hide_media")} onClick={() => run("hide_media", { dareId: it.dareId })}>
              hide media
            </PillButton>
          ))}
        {it.textHidden ? (
          <PillButton size="sm" variant="secondary" loading={b("unhide_text")} onClick={() => run("unhide_text", { dareId: it.dareId })}>
            unhide text
          </PillButton>
        ) : (
          <PillButton size="sm" variant="secondary" loading={b("hide_text")} onClick={() => run("hide_text", { dareId: it.dareId })}>
            hide text
          </PillButton>
        )}
        {it.proofUrl && (
          <PillButton size="sm" variant="danger" onClick={() => setConfirm("delete_proof")}>
            delete proof file
          </PillButton>
        )}
        {doer && (
          <PillButton size="sm" variant="ghost" loading={busy === `block_profile:${doer}`} onClick={() => run("block_profile", { wallet: doer })}>
            block {handle(it.doer)}
          </PillButton>
        )}
        {doer && (
          <PillButton size="sm" variant="ghost" onClick={() => setConfirm("delete_profile")}>
            delete {handle(it.doer)}&apos;s data
          </PillButton>
        )}
      </div>
      {confirm && (
        <div className="flex flex-col gap-2 rounded-[20px] border-[3px] border-danger p-3" role="alertdialog" aria-label="confirm">
          <p className="text-[15px] font-extrabold">{confirm === "delete_proof" ? "delete this proof file for good?" : `delete ${handle(it.doer)}'s profile, photo, proofs and reactions?`}</p>
          <div className="grid grid-cols-2 gap-2">
            <PillButton size="sm" variant="ghost" onClick={() => setConfirm(null)}>
              cancel
            </PillButton>
            <PillButton
              size="sm"
              variant="danger"
              onClick={() => {
                run(confirm, confirm === "delete_proof" ? { dareId: it.dareId } : { wallet: doer! });
                setConfirm(null);
              }}
            >
              delete
            </PillButton>
          </div>
        </div>
      )}
    </article>
  );
}

function AdminMain({ s }: { s: Session }) {
  const q = useAdmin(s);
  const qc = useQueryClient();
  const now = useNow();
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  async function run(action: Action, target: { dareId?: number; wallet?: string }) {
    const key = `${action}:${target.dareId ?? target.wallet}`;
    setBusy(key);
    setNote(null);
    try {
      if (!s.mock) await s.byw.api("/api/admin/action", { body: { action, ...target } });
      setNote(`done: ${action.replace("_", " ")}`);
      await qc.invalidateQueries({ queryKey: ["admin"] });
    } catch (err) {
      setNote(plainError(describeError(err)));
    } finally {
      setBusy(null);
    }
  }

  if (q.isLoading) return <Skeleton count={2} height={220} />;
  if (q.error instanceof HttpError && q.error.status === 403) return <EmptyState title="nothing here" body="this page isn't for you." />;
  if (q.error || !q.data) return <EmptyState title="couldn't load reports" body="try again in a moment." />;

  return (
    <div className="flex flex-col gap-6">
      <Headline line1="reports" line2="review queue." accent="violet" />
      {note && (
        <p className="text-[15px] font-extrabold" aria-live="polite">
          {note}
        </p>
      )}
      {q.data.items.length === 0 ? (
        <EmptyState title="all clear" body="no reports right now." />
      ) : (
        q.data.items.map((it) => <ReportedDare key={it.dareId} it={it} run={(a, t) => void run(a, t)} busy={busy} now={now} />)
      )}
      <section className="raised flex flex-col gap-3 p-5" aria-label="blocked profiles">
        <h2 className="font-display text-[16px] uppercase leading-tight tracking-normal">blocked profiles</h2>
        {q.data.blocked.length === 0 ? (
          <p className="text-[14px] text-muted">nobody is blocked.</p>
        ) : (
          <ul className="flex flex-col gap-2">
            {q.data.blocked.map((b) => (
              <li key={b.wallet} className="flex items-center justify-between gap-3">
                <span className="truncate text-[15px] font-extrabold">@{b.username}</span>
                <PillButton size="sm" variant="ghost" loading={busy === `unblock_profile:${b.wallet}`} onClick={() => void run("unblock_profile", { wallet: b.wallet })}>
                  unblock
                </PillButton>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

/** /admin: report queue and moderation actions (ADMIN_WALLETS only; the API enforces it). */
export function AdminScreen() {
  return <AppShell>{(s) => <AdminMain s={s} />}</AppShell>;
}
