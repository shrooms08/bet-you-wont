"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { useId, useMemo, useState } from "react";
import { formatUnits, parseUnits, type Address } from "viem";
import { useBalances, useFeed, usePrice, type Session } from "@/hooks/data";
import { useActions } from "@/hooks/useActions";
import { formatUsd, formatWif, groupName } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { AppShell } from "../app/AppShell";
import { InviteButton } from "../app/Crews";
import { Avatar } from "../ui/Avatar";
import { CheckIcon } from "../ui/icons";
import { WIF_LABEL } from "../ui/Money";
import { PillButton, PillLink } from "../ui/PillButton";
import { EmptyState } from "../ui/States";

const WEI = BigInt("1000000000000000000");
const QUICK = [5000, 10000, 25000];
const DO_TIMES: Array<[number, string]> = [
  [3600, "1h"],
  [86400, "24h"],
  [3 * 86400, "3d"],
  [7 * 86400, "7d"],
];
const VOTE_TIMES: Array<[number, string]> = [
  [900, "15m"],
  [3600, "1h"],
  [6 * 3600, "6h"],
  [86400, "24h"],
];

function Chip({ on, onClick, children, label }: { on: boolean; onClick: () => void; children: React.ReactNode; label?: string }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={label}
      onClick={onClick}
      className={`press flex min-h-11 shrink-0 items-center gap-2 whitespace-nowrap rounded-full border-[3px] px-4 text-[16px] font-extrabold ${on ? "border-primary bg-primary text-on-primary" : "border-line bg-surface"}`}
    >
      {children}
    </button>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: React.ReactNode }) {
  return (
    <fieldset className="flex flex-col gap-2.5">
      <legend className="mb-2.5 font-display text-[15px] uppercase tracking-normal">{label}</legend>
      {children}
      {hint}
    </fieldset>
  );
}

function CreateMain({ s }: { s: Session }) {
  const params = useSearchParams();
  const router = useRouter();
  const mock = useMockMode();
  const actions = useActions(s);
  const balances = useBalances(s);
  const price = usePrice();
  const groups = useMemo(() => s.me.data?.groups ?? [], [s.me.data?.groups]);
  const textId = useId();

  const [groupId, setGroupId] = useState<number | null>(() => {
    const g = Number(params.get("group"));
    return g > 0 ? g : null;
  });
  const gid = groupId ?? groups[0]?.id ?? null;
  const feed = useFeed(s, gid);
  const [text, setText] = useState(() => (params.get("text") ?? "").slice(0, 140));
  const [target, setTarget] = useState<string | null>(null);
  const [amount, setAmount] = useState<string>(() => {
    const a = Number(params.get("amount"));
    return a > 0 ? String(Math.round(a)) : "5000";
  });
  const [doDuration, setDoDuration] = useState(86400);
  const [voteWindow, setVoteWindow] = useState(3600);
  const [step, setStep] = useState<"draft" | "approve" | "send" | null>(null);

  const me = (s.address ?? "").toLowerCase();
  const members = (feed.data?.members ?? []).filter((m) => m.wallet !== me);
  const memberCount = feed.data?.stats.memberCount ?? groups.find((g) => g.id === gid)?.memberCount ?? 0;
  const tooSmall = feed.isSuccess && memberCount < 3;
  const len = [...text.trim()].length;
  let wei: bigint | null = null;
  try {
    wei = amount ? parseUnits(amount, 18) : null;
  } catch {
    wei = null;
  }
  const overBalance = wei !== null && balances.wif !== undefined && wei > balances.wif;
  const valid = gid !== null && len >= 3 && len <= 140 && wei !== null && wei >= WEI && !overBalance && !tooSmall;

  async function send() {
    if (!valid || gid === null || wei === null) return;
    const id = await actions.createDare(
      { groupId: gid, text: text.trim(), target: (target as Address | null) ?? null, wei, doDuration, voteWindow },
      setStep,
    );
    setStep(null);
    if (id) router.push(withMock(`/d/${id}`, mock));
  }

  if (s.me.isSuccess && groups.length === 0) {
    return (
      <EmptyState title="you need a crew first" body="dares happen inside crews. start one or join the public crowd.">
        <PillLink href={withMock("/crews", mock)}>find a crew</PillLink>
      </EmptyState>
    );
  }

  return (
    <form
      className="flex flex-col gap-7"
      onSubmit={(e) => {
        e.preventDefault();
        void send();
      }}
    >
      <h1 className="font-display text-[44px] uppercase leading-[0.92] tracking-[-0.03em] tab:text-[56px]">
        <span className="block text-danger">bet you</span>
        <span className="block">won&apos;t.</span>
      </h1>

      <Field label="crew">
        <div className="flex flex-wrap gap-2">
          {groups.map((g) => (
            <Chip key={g.id} on={g.id === gid} onClick={() => (setGroupId(g.id), setTarget(null))}>
              {groupName(g.id, g.name)}
            </Chip>
          ))}
        </div>
      </Field>

      {tooSmall ? (
        <div className="raised flex flex-col gap-3 !border-danger p-5" role="alert">
          <p className="text-[20px] font-extrabold tracking-[-0.04em]">a dare needs a witness: invite {3 - memberCount} more friend{3 - memberCount === 1 ? "" : "s"}</p>
          <p className="text-[15px] text-muted">someone other than you and the person you dare has to be able to vote.</p>
          <div>
            <InviteButton code={feed.data?.group.inviteCode ?? null} groupLabel={groupName(gid ?? 0, feed.data?.group.name)} />
          </div>
        </div>
      ) : (
        <>
          <Field label="the dare" hint={<p className={`text-right text-[13px] ${len > 140 ? "text-danger" : "text-muted"}`} aria-live="polite">{len}/140</p>}>
            <label htmlFor={textId} className="raised flex flex-col gap-1 p-4">
              <span className="text-[20px] font-extrabold tracking-[-0.04em] text-muted">bet you won&apos;t…</span>
              <textarea
                id={textId}
                rows={3}
                maxLength={160}
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="sing happy birthday to a stranger at the bus stop"
                className="resize-none bg-transparent text-[22px] font-extrabold leading-tight tracking-[-0.04em] text-accent-2 outline-none placeholder:text-muted/60"
              />
            </label>
          </Field>

          <Field label="who">
            <div data-hscroll className="flex gap-2 overflow-x-auto pb-1 [mask-image:linear-gradient(to_right,#000_calc(100%-24px),transparent)]">
              <Chip on={target === null} onClick={() => setTarget(null)}>
                anyone in the crew
              </Chip>
              {members.map((m) => (
                <Chip key={m.wallet} on={target === m.wallet} onClick={() => setTarget(m.wallet)} label={m.username ? `@${m.username}` : "member"}>
                  <Avatar person={m} size={28} />
                  <span className="whitespace-nowrap">{m.username ? `@${m.username}` : "new member"}</span>
                </Chip>
              ))}
            </div>
          </Field>

          <Field
            label="bounty"
            hint={
              <p className={`text-[14px] ${overBalance ? "text-danger" : "text-muted"}`} role={overBalance ? "alert" : undefined}>
                {overBalance
                  ? `that's more than you have (${formatWif(balances.wif!)} ${WIF_LABEL}).`
                  : balances.wif !== undefined
                    ? `you have ${formatWif(balances.wif)} ${WIF_LABEL}`
                    : ""}
              </p>
            }
          >
            <div className="flex flex-wrap gap-2">
              {QUICK.map((n) => (
                <Chip key={n} on={amount === String(n)} onClick={() => setAmount(String(n))}>
                  <span>{n / 1000}k</span>
                  <span className={`text-[13px] font-bold ${amount === String(n) ? "" : "text-muted"}`}>{formatUsd(BigInt(n) * WEI, price.data?.usd) ?? ""}</span>
                </Chip>
              ))}
            </div>
            <label className="field flex items-center gap-2">
              <span className="sr-only">custom amount</span>
              <input
                inputMode="numeric"
                value={amount}
                onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, "").slice(0, 12))}
                className="min-w-0 flex-1 bg-transparent outline-none"
                aria-label="bounty in $wif"
              />
              <span className="text-muted">$wif</span>
              {wei !== null && <span className="text-[14px] text-muted">{formatUsd(wei, price.data?.usd)}</span>}
            </label>
          </Field>

          <Field label="time to do it">
            <div className="flex flex-wrap gap-2">
              {DO_TIMES.map(([v, l]) => (
                <Chip key={v} on={doDuration === v} onClick={() => setDoDuration(v)}>
                  {l}
                </Chip>
              ))}
            </div>
          </Field>

          <Field label="voting time">
            <div className="flex flex-wrap gap-2">
              {VOTE_TIMES.map(([v, l]) => (
                <Chip key={v} on={voteWindow === v} onClick={() => setVoteWindow(v)}>
                  {l}
                </Chip>
              ))}
            </div>
          </Field>

          {step && (
            <ol className="flex flex-wrap gap-2" aria-label="sending steps">
              {(["approve", "send"] as const).map((st, i) => {
                const order = ["draft", "approve", "send"];
                const done = order.indexOf(step) > order.indexOf(st);
                const now = step === st;
                return (
                  <li key={st} className={`flex items-center gap-1.5 rounded-full border-[3px] px-3 py-1 text-[14px] font-extrabold ${now ? "border-primary bg-primary text-on-primary" : done ? "border-line bg-surface" : "border-line text-muted"}`}>
                    {done ? <CheckIcon size={14} /> : <span>{i + 1}</span>}
                    {st === "approve" ? "approve $wif" : "send dare"}
                  </li>
                );
              })}
            </ol>
          )}

          <PillButton type="submit" full size="lg" disabled={!valid} loading={actions.busy === "createDare"}>
            send dare{wei !== null && wei >= WEI ? ` · ${formatWif(wei)} $wif` : ""}
          </PillButton>
          <p className="text-center text-[13px] text-muted">
            your {amount && wei ? `${Number(formatUnits(wei, 18)).toLocaleString("en-US")} ` : ""}$wif is locked until the dare settles. keep it safe and legal.
          </p>
        </>
      )}
    </form>
  );
}

export function CreateDareScreen() {
  return <AppShell>{(s) => <CreateMain s={s} />}</AppShell>;
}
