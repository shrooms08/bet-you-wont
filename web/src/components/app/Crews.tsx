"use client";

import { AnimatePresence } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useId, useState } from "react";
import { usePublicGroup, type Session } from "@/hooks/data";
import type { Actions } from "@/hooks/useActions";
import { groupName, inviteCodeFrom, PUBLIC_GROUP_ID } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import type { FeedStats, MyGroup, PublicProfile } from "@/lib/types";
import { Avatar, AvatarStack } from "../ui/Avatar";
import { ChevronRightIcon, ShareIcon } from "../ui/icons";
import { Money } from "../ui/Money";
import { PillButton } from "../ui/PillButton";
import { PersonLink, StreakFlame } from "./People";
import { InviteSheet } from "./Sheets";

/** A wifie in a list: name, avatars, counts, chevron. */
export function CrewCard({ g }: { g: MyGroup }) {
  const mock = useMockMode();
  const name = groupName(g.id, g.name);
  return (
    <Link href={withMock(`/g/${g.id}`, mock)} className="raised press flex items-center gap-3 p-4 tab:p-5" aria-label={`open ${name}`}>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[22px] font-extrabold leading-tight tracking-[-0.04em]">{name}</span>
        <span className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2">
          {g.members && g.members.length > 0 && <AvatarStack people={g.members} size={34} />}
          <span className="text-[14px] text-muted">
            {g.memberCount} {g.memberCount === 1 ? "person" : g.isPublic ? "people" : "friends"}
            {g.isPublic ? " · public" : ""} · {g.liveDareCount} live
          </span>
        </span>
      </span>
      <span className="grid h-11 w-11 shrink-0 place-items-center rounded-full border-[3px] border-line" aria-hidden>
        <ChevronRightIcon size={18} />
      </span>
    </Link>
  );
}

/** "start a group": name it -> createGroup onchain + register. */
export function StartGroupCard({ actions, onCreated }: { actions: Actions; onCreated: (groupId: number) => void }) {
  const [name, setName] = useState("");
  const id = useId();
  const valid = name.trim().length >= 1 && [...name.trim()].length <= 40;
  async function start() {
    const res = await actions.createGroup(name.trim(), false);
    if (res) onCreated(res.groupId);
  }
  return (
    <form
      className="raised flex flex-col gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        if (valid) void start();
      }}
    >
      <label htmlFor={id} className="text-[20px] font-extrabold tracking-[-0.04em]">
        start a wifie
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="field min-w-0 flex-1"
          placeholder="name it"
          maxLength={40}
          value={name}
          onChange={(e) => setName(e.target.value)}
          autoComplete="off"
        />
        <PillButton type="submit" variant="secondary" disabled={!valid} loading={actions.busy === "createGroup"}>
          start it
        </PillButton>
      </div>
      <p className="text-[14px] text-muted">invite-only. you get a link to share.</p>
    </form>
  );
}

/** "got an invite code?": accepts a full link or the 10-letter code. */
export function InviteCodeCard() {
  const router = useRouter();
  const mock = useMockMode();
  const [value, setValue] = useState("");
  const [error, setError] = useState<string | null>(null);
  const id = useId();
  return (
    <form
      className="raised flex flex-col gap-3 p-5"
      onSubmit={(e) => {
        e.preventDefault();
        const code = inviteCodeFrom(value);
        if (!code) return setError("that doesn't look like an invite link or code.");
        router.push(withMock(`/i/${code}`, mock));
      }}
    >
      <label htmlFor={id} className="text-[20px] font-extrabold tracking-[-0.04em]">
        got an invite code?
      </label>
      <div className="flex gap-2">
        <input
          id={id}
          className="field min-w-0 flex-1 uppercase placeholder:normal-case"
          placeholder="link or code"
          value={value}
          onChange={(e) => {
            setValue(e.target.value);
            setError(null);
          }}
          autoComplete="off"
          autoCapitalize="none"
          aria-invalid={!!error}
          aria-describedby={error ? `${id}-err` : undefined}
        />
        <PillButton type="submit" variant="secondary" disabled={!value.trim()}>
          join
        </PillButton>
      </div>
      {error && (
        <p id={`${id}-err`} className="text-[14px] text-danger" role="alert">
          {error}
        </p>
      )}
    </form>
  );
}

/** The highlighted "join the world is flat wifie" card (public group). */
export function JoinPublicCard({ s, actions, onJoined }: { s: Session; actions: Actions; onJoined: (groupId: number) => void }) {
  const pub = usePublicGroup(PUBLIC_GROUP_ID);
  const already = s.me.data?.groups.some((g) => g.id === PUBLIC_GROUP_ID) && !s.mock;
  const name = groupName(PUBLIC_GROUP_ID, pub.data?.name);
  async function join() {
    if (already) return onJoined(PUBLIC_GROUP_ID);
    const ok = await actions.joinGroup(PUBLIC_GROUP_ID);
    if (ok) onJoined(PUBLIC_GROUP_ID);
  }
  return (
    <div className="raised relative flex flex-col gap-3 !border-primary p-5">
      <span className="absolute -top-4 right-5 rotate-[-4deg] rounded-full border-[3px] border-line bg-primary px-3 py-0.5 font-hand text-[18px] tracking-normal text-on-primary">
        start here
      </span>
      <p className="font-display text-[12px] uppercase tracking-[0.04em] text-muted">public · anyone can join</p>
      <p className="text-[26px] font-extrabold leading-[1.05] tracking-[-0.045em]">join the {name} wifie</p>
      {pub.data && (
        <div className="flex flex-wrap gap-2">
          <span className="rounded-full border-[3px] border-line bg-secondary px-3 py-1 text-[14px] text-on-secondary">{pub.data.openDares} dares open</span>
          <span className="rounded-full border-[3px] border-line bg-primary px-3 py-1 text-[14px] text-on-primary">{pub.data.votingDares} voting now</span>
          <span className="flex items-center gap-2 rounded-full border-[3px] border-line px-3 py-1 text-[14px]">
            {pub.data.members.length > 0 && <AvatarStack people={pub.data.members} size={22} max={4} />}
            {pub.data.memberCount} people
          </span>
        </div>
      )}
      <PillButton full size="lg" loading={actions.busy === `join:${PUBLIC_GROUP_ID}`} onClick={() => void join()}>
        {already ? "open the wifie" : "join the wifie"}
      </PillButton>
    </div>
  );
}

/** Opens the invite sheet (QR, copy link, native share). */
export function InviteButton({ code, groupLabel, variant = "secondary" }: { code: string | null; groupLabel: string; variant?: "secondary" | "ghost" }) {
  const [open, setOpen] = useState(false);
  if (!code) return null;
  return (
    <>
      <PillButton variant={variant} size="sm" onClick={() => setOpen(true)} aria-haspopup="dialog">
        <ShareIcon size={18} />
        invite
      </PillButton>
      <AnimatePresence>{open && <InviteSheet code={code} wifie={groupLabel} onClose={() => setOpen(false)} />}</AnimatePresence>
    </>
  );
}

/** Desktop side panel: members list. */
export function MembersPanel({ title, members, inviteCode, groupLabel }: { title: string; members: PublicProfile[]; inviteCode: string | null; groupLabel: string }) {
  return (
    <section className="raised flex flex-col gap-3 p-5" aria-label={title}>
      <h2 className="font-display text-[16px] uppercase leading-tight tracking-normal">{title}</h2>
      <ul className="flex max-h-[360px] flex-col gap-2.5 overflow-y-auto">
        {members.map((m) => (
          <li key={m.wallet}>
            <PersonLink username={m.username} className="flex items-center gap-3">
              <Avatar person={m} size={36} />
              <span className="truncate text-[16px] font-extrabold">{m.username ? `@${m.username}` : "new member"}</span>
              <StreakFlame n={m.streak} />
            </PersonLink>
          </li>
        ))}
      </ul>
      {inviteCode && (
        <div className="mt-1">
          <InviteButton code={inviteCode} groupLabel={groupLabel} />
        </div>
      )}
    </section>
  );
}

/** Desktop side panel: live stats for a group. */
export function StatsPanel({ stats }: { stats: FeedStats }) {
  return (
    <section className="raised flex flex-col gap-3 p-5" aria-label="live stats">
      <h2 className="font-display text-[16px] uppercase tracking-normal">live stats</h2>
      <dl className="flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <dt className="text-[15px] text-muted">open dares</dt>
          <dd className="font-display text-[22px] tracking-normal">{stats.openDares}</dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[15px] text-muted">$wif paid out</dt>
          <dd>
            <Money wei={stats.paidOut} size="sm" align="right" />
          </dd>
        </div>
        <div className="flex items-center justify-between gap-3">
          <dt className="text-[15px] text-muted">$wif burned</dt>
          <dd>
            <Money wei={stats.burned} size="sm" align="right" />
          </dd>
        </div>
      </dl>
    </section>
  );
}
