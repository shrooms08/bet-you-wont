import Link from "next/link";
import type { ReactNode } from "react";
import { LEGAL_UPDATED } from "@/lib/legal";
import { Logo } from "../brand/Logo";
import { LegalFooter } from "./LegalFooter";

/** Shell for /terms, /privacy and /guidelines: readable column, big title, sections. */
export function LegalPage({ title, intro, children }: { title: string; intro: string; children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[680px] flex-col gap-8 px-5 pb-[calc(40px+env(safe-area-inset-bottom))] pt-[calc(24px+env(safe-area-inset-top))] tab:pt-12">
      <Link href="/" className="flex w-fit items-center gap-3" aria-label="bet you won't home">
        <Logo size={34} decorative />
        <span className="font-display text-[18px] uppercase tracking-normal">bet you won&apos;t</span>
      </Link>
      <header className="flex flex-col gap-3">
        <h1 className="font-display text-[44px] uppercase leading-[0.92] tracking-[-0.03em] text-accent-2 tab:text-[56px]">{title}</h1>
        <p className="text-[18px] font-extrabold leading-snug tracking-[-0.03em]">{intro}</p>
        <p className="text-[13px] text-muted">last updated {LEGAL_UPDATED}</p>
      </header>
      <div className="legal flex flex-col gap-7">{children}</div>
      <LegalFooter className="mt-4 border-t-[3px] border-line pt-6" />
    </main>
  );
}

/** One titled section of a legal page. */
export function LegalSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3">
      <h2 className="font-display text-[20px] uppercase leading-tight tracking-normal">{title}</h2>
      <div className="flex flex-col gap-3 text-[16px] leading-relaxed [&_li]:ml-5 [&_li]:list-disc [&_a]:underline [&_a]:underline-offset-2">{children}</div>
    </section>
  );
}
