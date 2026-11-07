"use client";

import Link from "next/link";
import { useId } from "react";
import { Headline } from "../ui/Headline";

/** The required 18+ checkbox (a real checkbox with a big tap target). */
export function AgeCheckbox({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="raised flex min-h-14 cursor-pointer items-center gap-3 px-4 py-3">
      <input id={id} type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="h-6 w-6 shrink-0 accent-[var(--byw-primary)]" />
      {/* AGE_LINE in lib/ageGate.ts, with the two documents linked (they open in a new tab) */}
      <span className="text-[16px] font-extrabold leading-snug">
        i&apos;m 18 or older and i agree to the{" "}
        <Link href="/terms" target="_blank" className="underline underline-offset-2">
          terms
        </Link>{" "}
        and{" "}
        <Link href="/guidelines" target="_blank" className="underline underline-offset-2">
          guidelines
        </Link>
      </span>
    </label>
  );
}

/** Dead end for under-18s: no way forward. */
export function Under18() {
  return (
    <div className="flex flex-col gap-5 py-10" role="alert">
      <Headline line1="byw is" line2="18+." accent="violet" size="lg" />
      <p className="text-[20px] font-extrabold tracking-[-0.04em]">come back when you&apos;re older.</p>
      <p className="text-[16px] text-muted">bet you won&apos;t involves real money, so it&apos;s for adults only.</p>
    </div>
  );
}
