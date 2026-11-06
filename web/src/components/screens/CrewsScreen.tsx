"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { type Session } from "@/hooks/data";
import { useActions } from "@/hooks/useActions";
import { useMockMode, withMock } from "@/lib/mock";
import { AppShell } from "../app/AppShell";
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
      <Headline line1="your crews." line2="no cap." accent="lime" />
      <div className="flex flex-wrap gap-3">
        <PillButton variant={open === "start" ? "primary" : "secondary"} aria-expanded={open === "start"} onClick={() => setOpen(open === "start" ? null : "start")}>
          start a group
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
          <EmptyState title="no crews yet" body="start one with your friends, or jump into the public crowd." />
          <JoinPublicCard s={s} actions={actions} onJoined={openGroup} />
        </>
      )}
      <ul className="flex flex-col gap-4">
        {groups.map((g) => (
          <li key={g.id}>
            <CrewCard g={g} />
          </li>
        ))}
      </ul>
    </div>
  );
}

export function CrewsScreen() {
  return <AppShell active="crews">{(s) => <CrewsMain s={s} />}</AppShell>;
}
