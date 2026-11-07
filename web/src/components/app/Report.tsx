"use client";

import { useQueryClient } from "@tanstack/react-query";
import { AnimatePresence } from "motion/react";
import { useState } from "react";
import type { Session } from "@/hooks/data";
import { describeError } from "@/lib/errors";
import { plainError } from "@/lib/plainErrors";
import { FlagIcon, MoreIcon } from "../ui/icons";
import { PillButton } from "../ui/PillButton";
import { Sheet } from "./Sheets";

export const REPORT_REASONS = [
  ["dangerous", "dangerous stunt"],
  ["illegal", "illegal"],
  ["no_consent", "filmed without consent"],
  ["harassment", "harassment or hate"],
  ["nudity", "nudity"],
  ["other", "something else"],
] as const;
type Reason = (typeof REPORT_REASONS)[number][0];
type Target = "proof" | "dare";

/** "proof hidden" / "dare hidden" placeholder, shown where reported content used to be. */
export function HiddenNote({ what, className = "" }: { what: "proof" | "text"; className?: string }) {
  return (
    <p className={`text-[15px] font-extrabold text-muted ${className}`} role="note">
      {what === "proof" ? "proof hidden while we review a report." : "this dare's text is hidden while we review a report."}
    </p>
  );
}

/** The report sheet: what (the proof or the dare), why, optional details. */
export function ReportSheet({ s, dareId, hasProof, onClose }: { s: Session; dareId: number; hasProof: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [target, setTarget] = useState<Target>(hasProof ? "proof" : "dare");
  const [reason, setReason] = useState<Reason | null>(null);
  const [details, setDetails] = useState("");
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function send() {
    if (!reason) return;
    setState("busy");
    setError(null);
    try {
      if (!s.mock) await s.byw.api("/api/reports", { body: { dareId, target, reason, ...(details.trim() ? { details: details.trim() } : {}) } });
      setState("done");
      // hidden for you right away: refetch everything that shows dares
      for (const key of ["posts", "dare", "feed", "home", "user"]) void qc.invalidateQueries({ queryKey: [key] });
    } catch (err) {
      setError(plainError(describeError(err)));
      setState("idle");
    }
  }

  return (
    <Sheet title="report" onClose={onClose}>
      {state === "done" ? (
        <div className="flex flex-col gap-4">
          <p className="text-[18px] font-extrabold tracking-[-0.03em]">thanks. it&apos;s hidden for you now.</p>
          <p className="text-[15px] text-muted">if a few people report it, it&apos;s hidden for everyone until we review it.</p>
          <PillButton full onClick={onClose}>
            done
          </PillButton>
        </div>
      ) : (
        <form
          className="flex flex-col gap-4"
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
        >
          {hasProof && (
            <fieldset className="flex flex-col gap-2">
              <legend className="mb-2 font-display text-[14px] uppercase">what&apos;s wrong</legend>
              <div className="grid grid-cols-2 gap-2">
                {(["proof", "dare"] as const).map((t) => (
                  <PillButton key={t} type="button" size="sm" variant={target === t ? "primary" : "ghost"} aria-pressed={target === t} onClick={() => setTarget(t)}>
                    {t === "proof" ? "the proof" : "the dare"}
                  </PillButton>
                ))}
              </div>
            </fieldset>
          )}
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-2 font-display text-[14px] uppercase">why</legend>
            <div className="flex flex-wrap gap-2">
              {REPORT_REASONS.map(([value, label]) => (
                <PillButton key={value} type="button" size="sm" variant={reason === value ? "primary" : "ghost"} aria-pressed={reason === value} onClick={() => setReason(value)}>
                  {label}
                </PillButton>
              ))}
            </div>
          </fieldset>
          <label className="flex flex-col gap-1.5">
            <span className="text-[14px] text-muted">anything else? (optional)</span>
            <textarea
              rows={2}
              maxLength={280}
              value={details}
              onChange={(e) => setDetails(e.target.value)}
              className="field resize-none py-3"
              placeholder="what happened"
            />
          </label>
          {error && (
            <p className="text-[14px] text-danger" role="alert">
              {error}
            </p>
          )}
          <PillButton type="submit" full variant="danger" disabled={!reason} loading={state === "busy"}>
            <FlagIcon size={18} /> send report
          </PillButton>
        </form>
      )}
    </Sheet>
  );
}

/** The "⋯" button on posts and dares: opens the report sheet. */
export function ReportButton({ s, dareId, hasProof, className = "" }: { s: Session; dareId: number; hasProof: boolean; className?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={`report dare ${dareId}`}
        aria-haspopup="dialog"
        className={`press grid h-10 w-10 shrink-0 place-items-center rounded-full border-[3px] border-line bg-surface ${className}`}
      >
        <MoreIcon size={18} />
      </button>
      <AnimatePresence>{open && <ReportSheet s={s} dareId={dareId} hasProof={hasProof} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}
