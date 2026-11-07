"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { type Session } from "@/hooks/data";
import { useActions } from "@/hooks/useActions";
import { useMockMode, withMock } from "@/lib/mock";
import { AppShell } from "../app/AppShell";
import { StaggerItem, StaggerList } from "../motion/Stagger";
import { CrewCard, InviteCodeCard, JoinPublicCard, StartGroupCard } from "../app/Crews";
import { Headline } from "../ui/Headline";
import { PillButton } from "../ui/PillButton";
import { EmptyState, Skeleton } from "../ui/States";

function CrewsMain({ s }: { s: Session }) {
  const actions = useActions(s);
  const router = useRouter();
  const mock = useMockMode();
  const [open, setOpen] = useState<"start" | "code" | null>(null);
  const groups = s.me.data?.groups ?? [];
  const openGroup = (id: number) => router.push(withMock(`/g/${id}`, mock));

  return (
    <div className="flex flex-col gap-6">
      <Headline line1="your wifies." line2="no cap." accent="lime" />
      <WifiesExplainer />
      <div className="flex flex-wrap gap-3">
        <PillButton variant={open === "start" ? "primary" : "secondary"} aria-expanded={open === "start"} onClick={() => setOpen(open === "start" ? null : "start")}>
          start a wifie
        </PillButton>
        <PillButton variant={open === "code" ? "primary" : "ghost"} aria-expanded={open === "code"} onClick={() => setOpen(open === "code" ? null : "code")}>
          join with a code
        </PillButton>
      </div>
      {open === "start" && <StartGroupCard actions={actions} onCreated={openGroup} />}
      {open === "code" && <InviteCodeCard />}

      {s.me.isLoading && <Skeleton count={2} height={110} />}
      {s.me.isSuccess && groups.length === 0 && (
        <>
          <EmptyState title="no wifies yet" body="start one with your friends, or jump into the public one." />
          <JoinPublicCard s={s} actions={actions} onJoined={openGroup} />
        </>
      )}
      <StaggerList className="flex flex-col gap-4">
        {groups.map((g) => (
          <StaggerItem key={g.id}>
            <CrewCard g={g} />
          </StaggerItem>
        ))}
      </StaggerList>
    </div>
  );
}

/** One-time note: what a "wifie" is. Dismissed for good (localStorage). */
function WifiesExplainer() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once
      setShow(window.localStorage.getItem("byw:wifies-explained") !== "1");
    } catch {
      setShow(true);
    }
  }, []);
  if (!show) return null;
  const dismiss = () => {
    try {
      window.localStorage.setItem("byw:wifies-explained", "1");
    } catch {
      // storage blocked: it just shows again next time
    }
    setShow(false);
  };
  return (
    <div className="raised flex items-center justify-between gap-3 px-5 py-4" role="note">
      <p className="text-[16px]">
        <b>wifies</b> <span className="text-muted">(pronounced wefeez)</span>: your dare groups.
      </p>
      <button type="button" onClick={dismiss} className="min-h-11 shrink-0 text-[15px] font-extrabold text-primary underline underline-offset-2">
        got it
      </button>
    </div>
  );
}

export function CrewsScreen() {
  return <AppShell>{(s) => <CrewsMain s={s} />}</AppShell>;
}
