"use client";

import { useState } from "react";
import type { Session } from "@/hooks/data";
import { useActions } from "@/hooks/useActions";
import { setAgeOk } from "@/lib/ageGate";
import { AgeCheckbox } from "../onboarding/AgeGate";
import { PillButton } from "../ui/PillButton";

/**
 * One-time 18+ confirmation for profiles made before the age gate existed. Covers the app until
 * confirmed (write routes answer 403 "confirm you're 18+" until then).
 */
export function AgeModal({ s }: { s: Session }) {
  const actions = useActions(s);
  const [adult, setAdult] = useState(false);
  const [done, setDone] = useState(false);
  const profile = s.me.data?.profile;
  if (!profile || profile.ageConfirmed !== false || done) return null;
  async function confirm() {
    if (!adult || !profile?.username) return;
    const ok = await actions.saveProfile(profile.username, null, true);
    if (ok) {
      setAgeOk(true);
      setDone(true);
      void s.me.refetch();
    }
  }
  return (
    <div className="fixed inset-0 z-[65] grid place-items-center bg-black/80 p-4" data-no-burst>
      <div role="dialog" aria-modal="true" aria-labelledby="age-title" className="raised flex w-full max-w-[440px] flex-col gap-4 p-6">
        <h2 id="age-title" className="font-display text-[28px] uppercase leading-[0.95]">
          one quick thing
        </h2>
        <p className="text-[16px] text-muted">bet you won&apos;t is for adults. confirm once to keep daring.</p>
        <AgeCheckbox checked={adult} onChange={setAdult} />
        <PillButton full size="lg" disabled={!adult} loading={actions.busy === "profile"} onClick={() => void confirm()}>
          confirm
        </PillButton>
      </div>
    </div>
  );
}
