"use client";

import { motion } from "motion/react";
import type { Session } from "@/hooks/data";
import type { Actions } from "@/hooks/useActions";
import { useMockMode, withMock } from "@/lib/mock";
import { springs } from "@/lib/motion";
import { FREEZE_COST_TOKENS, streakAtRisk } from "@/lib/streak";
import type { Stats } from "@/lib/types";
import { PillButton, PillLink } from "../ui/PillButton";
import { StreakFlame } from "./People";

/** "+125 score" popping in with the bouncy spring (result screen). */
export function ScorePop({ points }: { points: number }) {
  if (!points) return null;
  return (
    <motion.p
      className={`inline-flex self-start rounded-full border-[3px] border-line px-4 py-1.5 font-display text-[22px] uppercase tracking-normal ${points > 0 ? "bg-primary text-on-primary" : "bg-danger text-on-danger"}`}
      initial={{ scale: 0.3, rotate: -8, opacity: 0 }}
      animate={{ scale: 1, rotate: -3, opacity: 1 }}
      transition={{ ...springs.bouncy, delay: 0.35 }}
      aria-live="polite"
    >
      {points > 0 ? "+" : ""}
      {points} score
    </motion.p>
  );
}

const MEDAL = ["bg-primary text-on-primary", "bg-secondary text-on-secondary", "bg-cream text-on-primary"];
/** Rank badge: 1-3 get lime / violet / cream medals. */
export function Medal({ rank }: { rank: number }) {
  return (
    <span
      className={`grid h-9 w-9 shrink-0 place-items-center rounded-full border-[3px] border-line font-display text-[15px] ${rank <= 3 ? MEDAL[rank - 1] : "bg-surface text-muted"}`}
      aria-label={`rank ${rank}`}
    >
      {rank}
    </span>
  );
}

/** "save my streak: burn 2,000 $wif" (only when a freeze would actually save a streak). */
export function FreezeButton({ stats, actions }: { stats: Stats | undefined; actions: Actions }) {
  const offer = stats?.freezeOffer;
  if (!offer) return null;
  return (
    <PillButton full variant="danger" loading={actions.busy === "freeze"} onClick={() => void actions.freezeStreak(offer.week)}>
      save my streak: burn {FREEZE_COST_TOKENS.toLocaleString("en-US")} $wif
    </PillButton>
  );
}

/** Home banner: from Thursday (UTC) when your streak's week hasn't qualified, or a freeze can save it. */
export function StreakBanner({ s, actions, now }: { s: Session; actions: Actions; now: number }) {
  const mock = useMockMode();
  const stats = s.me.data?.stats;
  if (!stats) return null;
  const atRisk = streakAtRisk(stats, now);
  if (!atRisk && !stats.freezeOffer) return null;
  return (
    <motion.section
      className="raised flex flex-col gap-3 !border-danger p-5"
      aria-label="streak at risk"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={springs.smooth}
    >
      <div className="flex items-center gap-3">
        <StreakFlame n={Math.max(stats.currentStreak, stats.freezeOffer?.streak ?? 0)} min={1} size="lg" />
        <div>
          <p className="font-display text-[20px] uppercase leading-none tracking-normal">streak at risk</p>
          <p className="mt-1 text-[15px] text-muted">
            {stats.freezeOffer && !atRisk ? "you missed a week. save it before it's gone." : "finish or settle a dare this week to keep it alive."}
          </p>
        </div>
      </div>
      <div className="flex flex-col gap-2 tab:flex-row">
        <PillLink href={withMock("/new", mock)} full>
          dare someone
        </PillLink>
        <FreezeButton stats={stats} actions={actions} />
      </div>
    </motion.section>
  );
}
