"use client";

import { animate, motion, useReducedMotion } from "motion/react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useUser, type Session } from "@/hooks/data";
import { HttpError } from "@/hooks/useByw";
import { useActions } from "@/hooks/useActions";
import { formatWif } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import type { ProofTile } from "@/lib/types";
import { AppShell } from "../app/AppShell";
import { StreakFlame } from "../app/People";
import { FreezeButton } from "../app/Score";
import { Avatar } from "../ui/Avatar";
import { PillButton, PillLink } from "../ui/PillButton";
import { EmptyState, Skeleton } from "../ui/States";
import { StatusTag, tagFor } from "../ui/StatusTag";

/** Big number that counts up from 0 on first show (instant under reduced motion). */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const reduced = useReducedMotion();
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (reduced) {
      el.textContent = value.toLocaleString("en-US");
      return;
    }
    const c = animate(0, value, { duration: 0.8, ease: "easeOut", onUpdate: (v) => (el.textContent = Math.round(v).toLocaleString("en-US")) });
    return () => c.stop();
  }, [value, reduced]);
  return <span ref={ref}>{value.toLocaleString("en-US")}</span>;
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col items-center gap-1 rounded-[24px] border-[3px] border-line bg-inset px-2 py-3 text-center">
      <span className="font-display text-[20px] leading-none tracking-normal">{value}</span>
      <span className="text-[12px] text-muted">{label}</span>
    </div>
  );
}

/** Instagram-style 3-column proof grid; videos get a play badge; tap opens the dare. */
function Grid({ tiles }: { tiles: ProofTile[] }) {
  const mock = useMockMode();
  if (!tiles.length) return <p className="py-8 text-center text-[15px] text-muted">nothing here yet.</p>;
  return (
    <ul className="grid grid-cols-3 gap-1.5" aria-label="proofs">
      {tiles.map((t) => (
        <li key={t.dareId}>
          <Link href={withMock(`/d/${t.dareId}`, mock)} className="relative block aspect-square overflow-hidden rounded-[14px] border-2 border-line bg-inset" aria-label={`dare ${t.dareId}`}>
            {t.thumb ? (
              // eslint-disable-next-line @next/next/no-img-element -- proof thumbnail from storage
              <img src={t.thumb} alt="" loading="lazy" className="h-full w-full object-cover" />
            ) : (
              <span className="grid h-full w-full place-items-center text-[13px] text-muted">clip</span>
            )}
            {t.kind === "video" && (
              <span className="absolute right-1.5 top-1.5 grid h-7 w-7 place-items-center rounded-full bg-bg/80 text-[12px]" aria-label="video">
                ▶
              </span>
            )}
            <span className="absolute bottom-1.5 left-1.5 origin-bottom-left scale-75">
              <StatusTag kind={tagFor(t.state, t.outcome)} />
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function ProfileMain({ s, username }: { s: Session; username: string | null }) {
  const name = username ?? s.profile?.username ?? null;
  const q = useUser(s, name);
  const actions = useActions(s);
  const router = useRouter();
  const mock = useMockMode();
  const [tab, setTab] = useState<"did" | "dared">("did");

  if (q.isLoading || !name) return <Skeleton count={2} height={200} />;
  if (q.error || !q.data) {
    const missing = q.error instanceof HttpError && q.error.status === 404;
    return (
      <EmptyState title={missing ? `no one called @${name}` : "couldn't load this profile"} body={missing ? "check the spelling." : "try again in a moment."}>
        <PillLink href={withMock("/home", mock)}>home</PillLink>
      </EmptyState>
    );
  }
  const { profile, stats, me } = q.data;
  const tiles = tab === "did" ? q.data.did : q.data.dared;

  return (
    <div className="flex flex-col gap-6">
      <section className="raised flex flex-col items-center gap-3 p-6 text-center" aria-label="profile">
        <Avatar person={profile} size={112} />
        <p className="flex items-center gap-2 text-[28px] font-extrabold tracking-[-0.045em]">@{profile.username}</p>
        <p className="font-display text-[64px] leading-none tracking-[-0.02em] text-accent-2">
          <CountUp value={stats.score} />
        </p>
        <p className="-mt-1 text-[14px] text-muted">dare score{stats.scoreWeek ? ` · ${stats.scoreWeek > 0 ? "+" : ""}${stats.scoreWeek} this week` : ""}</p>
        <div className="flex flex-wrap items-center justify-center gap-3">
          {stats.currentStreak > 0 ? (
            <motion.span className="flex items-center gap-2 text-[17px] font-extrabold" initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}>
              <StreakFlame n={stats.currentStreak} min={1} size="lg" />
              {stats.currentStreak}-week streak
            </motion.span>
          ) : (
            <span className="text-[15px] text-muted">no streak right now</span>
          )}
          <span className="text-[15px] text-muted">best: {stats.bestStreak} week{stats.bestStreak === 1 ? "" : "s"}</span>
        </div>
      </section>

      <div className="grid grid-cols-4 gap-2">
        <Stat label="dares done" value={String(stats.daresDone)} />
        <Stat label="dares sent" value={String(stats.daresDared)} />
        <Stat label="$wif won" value={formatWif(stats.wifWon)} />
        <Stat label="$wif burned" value={formatWif(stats.wifBurned)} />
      </div>

      {me && (
        <div className="flex flex-col gap-3">
          <FreezeButton stats={stats} actions={actions} />
          <div className="flex flex-wrap gap-3">
            <PillLink href={withMock("/start?step=you&from=profile", mock)} variant="secondary" size="sm">
              edit @name or photo
            </PillLink>
            <PillButton
              variant="ghost"
              size="sm"
              onClick={async () => {
                if (!s.mock) await s.byw.logout();
                router.replace("/start");
              }}
            >
              log out
            </PillButton>
          </div>
        </div>
      )}

      <div className="flex gap-2 rounded-full border-[3px] border-line bg-surface p-1" role="tablist" aria-label="proofs">
        {(["did", "dared"] as const).map((t) => (
          <button
            key={t}
            type="button"
            role="tab"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`min-h-11 flex-1 rounded-full text-[16px] font-extrabold ${tab === t ? "bg-primary text-on-primary" : ""}`}
          >
            {t} <span className="text-[13px] opacity-70">{(t === "did" ? q.data.did : q.data.dared).length}</span>
          </button>
        ))}
      </div>
      <Grid tiles={tiles} />
    </div>
  );
}

/** /profile (you) and /u/<username> (anyone). */
export function ProfileScreen({ username = null }: { username?: string | null }) {
  return <AppShell>{(s) => <ProfileMain s={s} username={username} />}</AppShell>;
}
