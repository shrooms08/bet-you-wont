"use client";

import { motion } from "motion/react";
import { useState, type ReactNode } from "react";
import { springs } from "@/lib/motion";
import { DoubleTapBurst } from "../motion/DoubleTapBurst";
import { StaggerItem, StaggerList } from "../motion/Stagger";
import { StampSlam, type StampOutcome } from "../motion/StampSlam";
import { VoteBar } from "../app/DareCard";
import { HowDeck } from "../onboarding/HowItWorks";
import { useTxToast } from "../tx/TxToast";
import { Headline } from "../ui/Headline";
import { Money } from "../ui/Money";
import { PillButton } from "../ui/PillButton";
import { Skeleton } from "../ui/States";
import { StatusTag, type TagKind } from "../ui/StatusTag";

const WEI = BigInt("1000000000000000000");
const TAGS: TagKind[] = ["OPEN", "AIGHT BET", "VOTING", "PASSED", "FAILED", "EXPIRED", "CANCELLED"];
const FAKE_HASH = `0x${"ab".repeat(32)}` as const;

function Demo({ title, hint, children, wide }: { title: string; hint?: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`raised flex flex-col gap-4 p-5 ${wide ? "desk:col-span-2" : ""}`} aria-label={title}>
      <div>
        <h2 className="font-display text-[18px] uppercase tracking-normal">{title}</h2>
        {hint && <p className="mt-1 text-[14px] text-muted">{hint}</p>}
      </div>
      {children}
    </section>
  );
}

function NavGlide() {
  const items = ["home", "crews", "new", "wallet", "profile"];
  const [active, setActive] = useState("home");
  return (
    <div className="flex flex-wrap gap-2">
      {items.map((it) => (
        <button
          key={it}
          type="button"
          onClick={() => setActive(it)}
          className={`press relative min-h-11 rounded-full border-[3px] border-line bg-surface px-4 text-[15px] font-extrabold ${active === it ? "text-on-primary" : ""}`}
        >
          {active === it && <motion.span layoutId="demo-pill" className="absolute inset-0 rounded-full bg-primary" transition={springs.smooth} />}
          <span className="relative">{it}</span>
        </button>
      ))}
    </div>
  );
}

/** /dev/motion: every 3c-2m animation in one place. */
export function MotionGallery() {
  const toast = useTxToast();
  const [stamp, setStamp] = useState<{ outcome: StampOutcome; key: number } | null>(null);
  const [wei, setWei] = useState(BigInt(5000) * WEI);
  const [tag, setTag] = useState(0);
  const [votes, setVotes] = useState(1);
  const [replay, setReplay] = useState(0);
  const [reacts, setReacts] = useState(0);

  return (
    <main className="mx-auto flex max-w-[1100px] flex-col gap-6 px-5 py-8">
      <Headline key={`h${replay}`} line1="motion" line2="gallery." accent="lime" />
      <p className="text-[16px] text-muted">
        dev only. move the mouse (pixel cursor + dot spotlight), click anywhere (glyph burst). reduced-motion turns the decorative parts off.
      </p>
      <div className="grid gap-6 desk:grid-cols-2">
        <Demo title="cursor + spotlight" hint="hover a button: the arrow tilts 8° and grows. hover the field: native caret.">
          <div className="flex flex-wrap items-center gap-3">
            <PillButton>hover me</PillButton>
            <input className="field max-w-[220px]" placeholder="type here" aria-label="sample text field" />
          </div>
        </Demo>

        <Demo title="stamp slam" hint="bouncy drop, 2-frame shake, dot confetti.">
          <div className="flex flex-wrap gap-3">
            {(["PASSED", "FAILED", "EXPIRED"] as const).map((o) => (
              <PillButton key={o} size="sm" variant={o === "PASSED" ? "primary" : "secondary"} onClick={() => setStamp({ outcome: o, key: Date.now() })}>
                {o.toLowerCase()}
              </PillButton>
            ))}
          </div>
          <div className="grid min-h-[200px] place-items-center">{stamp && <StampSlam key={stamp.key} outcome={stamp.outcome} />}</div>
        </Demo>

        <Demo title="o1 card deck" hint="next, or drag/swipe left and right. rubber-bands at the ends.">
          <div className="mx-auto flex w-full max-w-[360px] flex-col gap-6">
            <HowDeck onDone={() => toast.show("o1 deck", { status: "done", message: "that would go to sign in" })} />
          </div>
        </Demo>

        <Demo title="double tap" hint={`double-click or double-tap the photo. reactions: ${reacts}`}>
          <DoubleTapBurst onReact={() => setReacts((n) => n + 1)} className="overflow-hidden rounded-[26px] border-[3px] border-line">
            {/* eslint-disable-next-line @next/next/no-img-element -- demo media */}
            <img src="/onboarding/o1-paid.png" alt="demo proof photo" className="block h-[260px] w-full bg-inset object-contain" draggable={false} />
          </DoubleTapBurst>
        </Demo>

        <Demo title="tx toast states" hint="springs up from the bottom; check draws in; failure shakes.">
          <div className="flex flex-wrap gap-3">
            <PillButton size="sm" variant="ghost" onClick={() => toast.show("aight bet", { status: "working", step: "", phase: "confirm" })}>
              confirm
            </PillButton>
            <PillButton size="sm" variant="ghost" onClick={() => toast.show("aight bet", { status: "working", step: "", phase: "sending", hash: FAKE_HASH })}>
              sending
            </PillButton>
            <PillButton size="sm" onClick={() => toast.show("aight bet", { status: "done", hash: FAKE_HASH, message: "you're on." })}>
              done
            </PillButton>
            <PillButton size="sm" variant="danger" onClick={() => toast.show("aight bet", { status: "error", message: "Reverted: GroupTooSmall" })}>
              failed
            </PillButton>
          </div>
        </Demo>

        <Demo title="count-up, tag flip, vote bar">
          <div className="flex flex-wrap items-center gap-4">
            <Money wei={wei} size="lg" />
            <PillButton size="sm" variant="secondary" onClick={() => setWei((w) => w + BigInt(2500) * WEI)}>
              +2,500
            </PillButton>
          </div>
          <div className="flex items-center gap-4">
            <StatusTag kind={TAGS[tag % TAGS.length]} />
            <PillButton size="sm" variant="ghost" onClick={() => setTag((t) => t + 1)}>
              next status
            </PillButton>
          </div>
          <VoteBar pass={votes % 4} fail={0} eligible={3} />
          <PillButton size="sm" variant="ghost" onClick={() => setVotes((v) => v + 1)}>
            add a vote
          </PillButton>
        </Demo>

        <Demo title="nav pill glide" hint="the same shared-layout pill the bottom nav and rail use.">
          <NavGlide />
        </Demo>

        <Demo title="headline, list stagger, skeleton" hint="replay remounts them.">
          <PillButton size="sm" variant="ghost" onClick={() => setReplay((r) => r + 1)}>
            replay
          </PillButton>
          <StaggerList key={`l${replay}`} className="flex flex-col gap-2">
            {["waiting on you", "your crews", "the dare board"].map((t) => (
              <StaggerItem key={t} className="rounded-full border-[3px] border-line bg-inset px-4 py-2 text-[15px]">
                {t}
              </StaggerItem>
            ))}
          </StaggerList>
          <Skeleton count={1} height={80} />
        </Demo>
      </div>
    </main>
  );
}
