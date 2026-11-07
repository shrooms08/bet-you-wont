"use client";

import { Logo } from "@/components/brand/Logo";
import { AnimatePresence, motion } from "motion/react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useState, type ReactNode } from "react";
import { useBalances, useInvitePreview, useSession, type Session } from "@/hooks/data";
import { useActions, type Actions } from "@/hooks/useActions";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import { activeChain } from "@/lib/contracts";
import { describeError } from "@/lib/errors";
import { groupName, handle, PUBLIC_GROUP_ID, shortAddress } from "@/lib/format";
import { useMockMode, withMock } from "@/lib/mock";
import { springs } from "@/lib/motion";
import type { InvitePreview } from "@/lib/types";
import { DareText } from "../app/DareText";
import { InviteCodeCard, JoinPublicCard, StartGroupCard } from "../app/Crews";
import { AddressQr, WalletCard } from "../app/WalletCard";
import { Avatar, DOODLE_SRC } from "../ui/Avatar";
import { Headline } from "../ui/Headline";
import { CameraIcon, CheckIcon, XIcon } from "../ui/icons";
import { Money } from "../ui/Money";
import { PillButton, PillLink } from "../ui/PillButton";
import { StatusTag } from "../ui/StatusTag";
import { EmptyState } from "../ui/States";
import { PageEnter } from "../motion/PageEnter";
import { StaggerItem, StaggerList } from "../motion/Stagger";
import { ageOk, isUnder18, markUnder18, setAgeOk } from "@/lib/ageGate";
import { AgeCheckbox, Under18 } from "./AgeGate";
import { StepHow } from "./HowItWorks";
import { Sticker } from "./Sticker";
import { LegalFooter } from "../legal/LegalFooter";

export type Step = "how" | "signin" | "you" | "wallet" | "crew" | "first";
const NEEDS_LOGIN: Step[] = ["you", "wallet", "crew", "first"];

/**
 * Onboarding O1-O6 at /start?step=..., and the invite-link variant at /i/<code>?step=...
 * (invite preview on every step, no O5/O6: after the wallet step it joins via permit and lands on
 * the group feed). Step lives in the URL so back/forward work.
 */
export function Onboarding({ inviteCode }: { inviteCode?: string }) {
  const s = useSession();
  const actions = useActions(s);
  const params = useSearchParams();
  const router = useRouter();
  const mock = useMockMode();
  const invite = useInvitePreview(inviteCode ?? null);
  const [under18, setUnder18] = useState(false);
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once
    if (isUnder18()) setUnder18(true);
  }, []);

  const steps: Step[] = inviteCode ? ["how", "signin", "you", "wallet"] : ["how", "signin", "you", "wallet", "crew", "first"];
  const requested = params.get("step") as Step | null;
  const step: Step = requested && steps.includes(requested) ? requested : "how";
  const groupParam = Number(params.get("group") ?? PUBLIC_GROUP_ID);
  const base = inviteCode ? `/i/${inviteCode}` : "/start";
  const go = (next: Step, extra = "", replace = false) => {
    const url = withMock(`${base}?step=${next}${extra}`, mock);
    if (replace) router.replace(url);
    else router.push(url);
  };
  const inviteGroupId = invite.data?.groupId ?? null;
  const toFeed = (id: number) => router.replace(withMock(`/g/${id}`, mock));

  // --- routing guards (never in mock mode) ---------------------------------------------------
  const hasProfile = s.me.isSuccess && !!s.me.data.profile;
  const isMember = inviteGroupId !== null && !!s.me.data?.groups.some((g) => g.id === inviteGroupId);
  useEffect(() => {
    if (s.mock || !s.ready) return;
    if (!s.authenticated) {
      if (NEEDS_LOGIN.includes(step)) go("signin", "", true);
      return;
    }
    if (!s.me.isSuccess) return;
    if (!hasProfile) {
      if (step !== "you") go("you", "", true);
      return;
    }
    if (!inviteCode) {
      // Already onboarded and landed on the welcome/sign-in steps: straight to home.
      if (step === "how" || step === "signin") router.replace("/home");
      return;
    }
    // Invite link while onboarded: member -> feed; otherwise the wallet step, which has an explicit
    // "join <crew>" button (and explains gas if the wallet is empty). Nothing signs on page load.
    if (inviteGroupId === null) return;
    if (isMember) return toFeed(inviteGroupId);
    if (step === "how" || step === "signin" || step === "you") go("wallet", "", true);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- go/toFeed/actions are recreated each render; the inputs below are what matter
  }, [s.mock, s.ready, s.authenticated, s.me.isSuccess, hasProfile, step, inviteCode, inviteGroupId, isMember]);

  if (under18) {
    return (
      <Frame>
        <Under18 />
      </Frame>
    );
  }

  if (inviteCode && invite.isError) {
    return (
      <Frame>
        <EmptyState title="that invite link doesn't work" body="it may be mistyped or replaced. ask your friend for a fresh one.">
          <PillLink href={withMock("/start", mock)}>start without it</PillLink>
        </EmptyState>
      </Frame>
    );
  }

  // Step pills start at O2: O1 is the intro and has its own carousel dots on mobile.
  const progressSteps = steps.filter((st) => st !== "how");
  const inviteNote = invite.data && <InviteNote invite={invite.data} />;

  if (step === "how") {
    return (
      <main className="mx-auto flex min-h-dvh w-full max-w-[1100px] flex-col px-5 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))] tab:px-8 tab:pt-8">
        <div className="flex justify-end">
          <PillButton variant="ghost" size="sm" onClick={() => go("signin")}>
            skip
          </PillButton>
        </div>
        {/* my-auto centers the block vertically when the screen is taller than the content */}
        <PageEnter className="my-auto flex flex-col gap-6 py-4">
          {inviteNote && <div className="tab:mx-auto tab:w-full tab:max-w-[520px]">{inviteNote}</div>}
          <StepHow onDone={() => go("signin")} />
        </PageEnter>
      </main>
    );
  }

  const header = (
    <>
      <Progress steps={progressSteps} current={step} />
      {inviteNote}
    </>
  );

  return (
    <Frame>
      {/* each step enters like a route: fade in + rise 12px */}
      <PageEnter key={step} className="flex flex-1 flex-col gap-6">
      {header}
      {step === "signin" && (
        <StepSignIn
          s={s}
          onMock={() => go("you")}
          onUnder18={() => {
            markUnder18();
            setUnder18(true);
          }}
        />
      )}
      {step === "you" && (
        <StepYou s={s} actions={actions} onDone={() => (params.get("from") === "profile" ? router.push(withMock("/profile", mock)) : go("wallet"))} />
      )}
      {step === "wallet" && (
        <StepWallet
          s={s}
          actions={actions}
          invite={invite.data ?? null}
          inviteCode={inviteCode}
          onNext={() => go("crew")}
          onJoined={toFeed}
          onLater={() => router.push(withMock("/home", mock))}
        />
      )}
      {step === "crew" && <StepCrew s={s} actions={actions} onPicked={(id) => go("first", `&group=${id}`)} />}
      {step === "first" && <StepFirst s={s} groupId={groupParam} />}
      </PageEnter>
    </Frame>
  );
}

function Frame({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-[520px] flex-col gap-6 px-5 pb-[calc(32px+env(safe-area-inset-bottom))] pt-[calc(20px+env(safe-area-inset-top))] tab:pt-12">
      {children}
      <LegalFooter className="mt-auto pt-2" />
    </main>
  );
}

function Progress({ steps, current }: { steps: Step[]; current: Step }) {
  const idx = steps.indexOf(current);
  return (
    <ol className="flex items-center gap-2" aria-label={`step ${idx + 1} of ${steps.length}`}>
      {steps.map((st, i) => (
        <li
          key={st}
          aria-current={i === idx ? "step" : undefined}
          className={`h-3 rounded-full border-2 border-line ${i === idx ? "w-9 bg-cream" : i < idx ? "w-4 bg-primary" : "w-4 bg-surface"}`}
        >
          <span className="sr-only">{st}</span>
        </li>
      ))}
    </ol>
  );
}

function InviteNote({ invite }: { invite: InvitePreview }) {
  return (
    <div className="raised flex items-center gap-3 px-4 py-3" role="note">
      <Avatar person={invite.creator} size={44} />
      <p className="text-[16px] font-extrabold leading-tight">
        {handle(invite.creator)} invited you to <span className="text-accent-2">{groupName(invite.groupId, invite.name)}</span>
        <span className="block text-[13px] font-bold text-muted">
          {invite.memberCount} {invite.memberCount === 1 ? "person" : "people"} · {invite.isPublic ? "public" : "invite only"}
        </span>
      </p>
      <Logo size={26} className="ml-auto shrink-0" />
    </div>
  );
}

// ---------------------------------------------------------------- O2 sign in

function StepSignIn({ s, onMock, onUnder18 }: { s: Session; onMock: () => void; onUnder18: () => void }) {
  const [adult, setAdult] = useState(false);
  const login = (method: "email" | "google" | "wallet") => {
    if (!adult) return;
    setAgeOk(true);
    if (s.mock) return onMock();
    s.byw.login({ loginMethods: [method] });
  };
  return (
    <>
      <div className="relative min-h-[300px] pt-16">
        <div className="absolute -right-2 top-0 z-0">
          <Sticker src="/onboarding/signin-hero.png" alt="someone with a traffic cone on their head doing peace signs" rotate={5} width={150} float />
        </div>
        <div className="relative z-10 max-w-[300px]">
          <Logo size={52} className="mb-5" />
          <Headline line1="bet you" line2="won't." accent="lime" size="xl" />
          <p className="mt-4 inline-block -rotate-3 rounded-full border-[3px] border-line bg-primary px-5 py-1.5 font-hand text-[30px] tracking-normal text-on-primary shadow-lip">
            hold my wif
          </p>
        </div>
      </div>
      <div className="raised flex flex-col gap-2 p-5 opacity-90" aria-hidden>
        <div className="flex items-center justify-between">
          <span className="flex items-center gap-2 text-[15px]">
            <Avatar person={{ wallet: "0x0", username: "kemi", avatarUrl: null, ringColor: "#B19EF0" }} size={30} />
            @kemi
          </span>
          <StatusTag kind="OPEN" />
        </div>
        <DareText text="wear socks with sandals to brunch" size="sm" />
        <Money wei={(BigInt(2500) * BigInt(10) ** BigInt(18)).toString()} size="sm" />
      </div>
      <div className="mt-auto flex flex-col gap-3">
        <AgeCheckbox checked={adult} onChange={setAdult} />
        <PillButton full size="lg" onClick={() => login("email")} disabled={!s.ready || !adult}>
          continue with email
        </PillButton>
        <PillButton full size="lg" variant="ghost" onClick={() => login("google")} disabled={!s.ready || !adult}>
          continue with google
        </PillButton>
        <PillButton full size="lg" variant="ghost" onClick={() => login("wallet")} disabled={!s.ready || !adult}>
          connect wallet
        </PillButton>
        <button type="button" onClick={onUnder18} className="mx-auto min-h-11 text-[14px] text-muted underline underline-offset-2">
          i&apos;m under 18
        </button>
        <p className="text-center text-[14px] text-muted">dares have to be safe, legal and kind. that&apos;s the only rule.</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- O3 you

type NameStatus = "empty" | "invalid" | "checking" | "available" | "taken" | "yours" | "error";
const MOCK_TAKEN = ["tobi", "ada", "kemi", "dayo", "admin", "byw"];

function useUsernameCheck(name: string, current: string | null, mock: boolean): { status: NameStatus; reason?: string } {
  const [result, setResult] = useState<{ name: string; status: NameStatus; reason?: string }>({ name: "", status: "empty" });
  const valid = /^[a-z0-9_]{3,20}$/.test(name);
  useEffect(() => {
    if (!valid || name === current) return;
    let live = true;
    const t = window.setTimeout(async () => {
      try {
        if (mock) {
          if (live) setResult({ name, status: MOCK_TAKEN.includes(name) ? "taken" : "available" });
          return;
        }
        const res = await fetch(`/api/profile/check?username=${encodeURIComponent(name)}`, { cache: "no-store" });
        const body = (await res.json()) as { available?: boolean; valid?: boolean; reason?: string; error?: string };
        if (!live) return;
        if (!res.ok) setResult({ name, status: "error", reason: body.error });
        else setResult({ name, status: body.available ? "available" : "taken" });
      } catch {
        if (live) setResult({ name, status: "error", reason: "couldn't check right now" });
      }
    }, 400);
    return () => {
      live = false;
      window.clearTimeout(t);
    };
  }, [name, valid, current, mock]);
  if (!name) return { status: "empty" };
  if (!valid) return { status: "invalid" };
  if (name === current) return { status: "yours" };
  if (result.name !== name) return { status: "checking" };
  return { status: result.status, reason: result.reason };
}

function StepYou({ s, actions, onDone }: { s: Session; actions: Actions; onDone: () => void }) {
  const current = s.profile?.username ?? null;
  const [name, setName] = useState(current ?? "");
  const [photo, setPhoto] = useState<File | null>(null);
  const preview = useObjectUrl(photo);
  const check = useUsernameCheck(name, current, !!s.mock);
  // ticked on the sign-in step in this browser? then don't ask twice
  const [askedBefore, setAskedBefore] = useState(true);
  const [adult, setAdult] = useState(true);
  useEffect(() => {
    const before = ageOk();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- reads browser storage once
    setAskedBefore(before);
    setAdult(before);
  }, []);
  const inputId = useId();
  const hintId = useId();

  const ok = check.status === "available" || check.status === "yours";
  const hint: Record<NameStatus, string> = {
    empty: "3 to 20 letters, numbers or _",
    invalid: "3 to 20 letters, numbers or _",
    checking: "checking…",
    available: `@${name} is yours`,
    taken: "taken. try another",
    yours: "that's you",
    error: check.reason ?? "couldn't check right now",
  };

  async function save() {
    if (!ok) return;
    if (!adult) return;
    setAgeOk(true);
    const done = await actions.saveProfile(name, photo, true);
    if (done) onDone();
  }

  const shownAvatar = preview ?? s.profile?.avatarUrl ?? null;
  return (
    <>
      <Headline line1="who are" line2="you?" accent="lime" />
      <p className="-mt-2 text-[17px] text-muted">friends see your @name and photo. never your wallet.</p>
      <form
        className="flex flex-col gap-5"
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <div className="flex flex-col gap-2">
          <label htmlFor={inputId} className="font-display text-[17px] uppercase tracking-normal">
            your @name
          </label>
          <div className="field flex min-h-[64px] items-center gap-1 text-[26px]">
            <span className="text-muted" aria-hidden>
              @
            </span>
            <input
              id={inputId}
              value={name}
              onChange={(e) => setName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "").slice(0, 20))}
              placeholder="zee"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={hintId}
              aria-invalid={check.status === "taken" || check.status === "invalid" ? true : undefined}
              className="min-w-0 flex-1 bg-transparent font-extrabold tracking-[-0.04em] outline-none"
            />
          </div>
          <p
            id={hintId}
            aria-live="polite"
            className={`pl-2 text-[15px] ${ok ? "text-accent-2" : check.status === "taken" ? "text-danger" : "text-muted"}`}
          >
            <span className="inline-flex items-center gap-1.5">
              <AnimatePresence initial={false} mode="popLayout">
                {(ok || check.status === "taken") && (
                  <motion.span
                    key={ok ? "ok" : "no"}
                    aria-hidden
                    initial={{ scale: 0, rotate: -30 }}
                    animate={{ scale: 1, rotate: 0 }}
                    exit={{ scale: 0, opacity: 0 }}
                    transition={springs.bouncy}
                    className={`grid h-6 w-6 place-items-center rounded-full ${ok ? "bg-primary text-on-primary" : "bg-danger text-on-danger"}`}
                  >
                    {ok ? <CheckIcon size={14} /> : <XIcon size={12} />}
                  </motion.span>
                )}
              </AnimatePresence>
              {hint[check.status]}
            </span>
          </p>
        </div>

        <div className="raised flex items-center gap-4 p-5">
          {/* eslint-disable-next-line @next/next/no-img-element -- local preview or doodle */}
          <img
            src={shownAvatar ?? DOODLE_SRC}
            alt={photo ? "your new photo" : "default doodle avatar"}
            className="h-24 w-24 shrink-0 rounded-full border-[3px] border-dashed border-line object-cover"
          />
          <div className="flex min-w-0 flex-1 flex-col gap-2.5">
            <label className="press inline-flex min-h-11 cursor-pointer items-center justify-center gap-2 rounded-full border-[3px] border-line bg-secondary px-4 text-[16px] font-extrabold text-on-secondary focus-within:outline focus-within:outline-[3px] focus-within:outline-offset-[3px] focus-within:outline-primary">
              <CameraIcon size={18} />
              {photo ? "change photo" : "add a photo"}
              {/* jpeg/png/webp only: iPhones then hand us a converted JPEG instead of HEIC */}
              <input type="file" accept="image/jpeg,image/png,image/webp" className="sr-only" onChange={(e) => setPhoto(e.target.files?.[0] ?? null)} />
            </label>
            <button
              type="button"
              onClick={() => setPhoto(null)}
              className="min-h-11 text-[15px] text-muted underline underline-offset-2"
            >
              skip, use a doodle
            </button>
          </div>
        </div>

        {!askedBefore && <AgeCheckbox checked={adult} onChange={setAdult} />}
        <PillButton type="submit" full size="lg" disabled={!ok || !adult} loading={actions.busy === "profile"}>
          that&apos;s me
        </PillButton>
      </form>
    </>
  );
}

// ---------------------------------------------------------------- O4 wallet

function StepWallet({
  s,
  actions,
  invite,
  inviteCode,
  onNext,
  onJoined,
  onLater,
}: {
  s: Session;
  actions: Actions;
  invite: InvitePreview | null;
  inviteCode?: string;
  onNext: () => void;
  onJoined: (groupId: number) => void;
  onLater: () => void;
}) {
  const balances = useBalances(s);
  const [switchError, setSwitchError] = useState<string | null>(null);
  const [switching, setSwitching] = useState(false);
  const noGas = balances.eth !== undefined && balances.eth === BigInt(0);
  const chain = activeChain.name;

  if (!s.isEmbedded && !s.onRightChain) {
    return (
      <>
        <Headline line1="one quick" line2="thing." accent="violet" />
        <div className="raised flex flex-col gap-4 p-5">
          <h2 className="text-[26px] font-extrabold leading-tight tracking-[-0.045em]">switch to the right network</h2>
          <p className="text-[16px] text-muted">
            your wallet is on another network. bet you won&apos;t runs on {chain}, where gas costs less than a cent.
          </p>
          <PillButton
            full
            size="lg"
            loading={switching}
            onClick={async () => {
              setSwitching(true);
              setSwitchError(null);
              try {
                if (!s.mock) await s.byw.ensureChain();
              } catch (err) {
                setSwitchError(describeError(err));
              } finally {
                setSwitching(false);
              }
            }}
          >
            switch to {chain}
          </PillButton>
          {switchError && (
            <p role="alert" className="text-[15px] text-danger">
              {switchError}
            </p>
          )}
        </div>
        {s.address && <p className="text-center text-[14px] text-muted">connected: {shortAddress(s.address)}</p>}
      </>
    );
  }

  const label = invite ? groupName(invite.groupId, invite.name) : "";
  async function join() {
    if (!invite || !inviteCode) return;
    const ok = await actions.joinGroup(invite.groupId, inviteCode);
    if (ok) onJoined(invite.groupId);
  }

  return (
    <>
      <Headline line1="your wallet" line2="is ready." accent="lime" />
      <WalletCard s={s} />
      {invite && noGas && (
        <div className="raised !border-primary p-5" role="note">
          <p className="text-[18px] font-extrabold tracking-[-0.04em]">joining {label} needs a tiny bit of gas</p>
          <p className="mt-1 text-[15px] text-muted">add a little ETH to the address above (less than a cent per move), then tap join.</p>
        </div>
      )}
      <p className="text-[16px] leading-snug">
        every move costs a tiny bit of ETH for gas (less than a cent). add a little ETH and some $wif to start daring
      </p>
      <ol className="flex flex-col gap-3 text-[15px]">
        {["copy your address (or scan the code below)", `send it a little ETH on ${chain}. a few dollars covers hundreds of moves`, "swap some for $wif, or ask a friend to send you some"].map(
          (t, i) => (
            <li key={t} className="flex items-start gap-3">
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full border-[3px] border-line bg-primary font-display text-[14px] text-on-primary">
                {i + 1}
              </span>
              <span className="pt-1">{t}</span>
            </li>
          ),
        )}
      </ol>
      {s.address && <AddressQr address={s.address} size={196} />}
      <div className="flex flex-col gap-3">
        {invite ? (
          <>
            <PillButton full size="lg" disabled={noGas} loading={actions.busy === `join:${invite.groupId}`} onClick={() => void join()}>
              join {label}
            </PillButton>
            {noGas && (
              <PillButton full variant="ghost" onClick={() => balances.refetch()}>
                i&apos;ve topped up, check again
              </PillButton>
            )}
          </>
        ) : (
          <PillButton
            full
            size="lg"
            onClick={() => {
              balances.refetch();
              onNext();
            }}
          >
            i&apos;ve topped up
          </PillButton>
        )}
        <PillButton full variant="ghost" onClick={invite ? onLater : onNext}>
          do this later
        </PillButton>
        <p className="text-center text-[14px] text-muted">you can look around, but you&apos;ll need ETH to dare, accept or vote.</p>
      </div>
    </>
  );
}

// ---------------------------------------------------------------- O5 your crew

function StepCrew({ s, actions, onPicked }: { s: Session; actions: Actions; onPicked: (groupId: number) => void }) {
  return (
    <>
      <Headline line1="find your" line2="wifie." accent="lime" />
      <StaggerList as="div" className="mt-3 flex flex-col gap-5">
        <StaggerItem as="div">
          <JoinPublicCard s={s} actions={actions} onJoined={onPicked} />
        </StaggerItem>
        <StaggerItem as="div">
          <InviteCodeCard />
        </StaggerItem>
        <StaggerItem as="div">
          <StartGroupCard actions={actions} onCreated={onPicked} />
        </StaggerItem>
      </StaggerList>
    </>
  );
}

// ---------------------------------------------------------------- O6 first dare

export const FIRST_DARES = [
  "compliment a stranger's outfit",
  "order your next drink in a fake accent",
  "post your worst selfie as your pfp for 24h",
];

function StepFirst({ s, groupId }: { s: Session; groupId: number }) {
  const mock = useMockMode();
  const g = s.me.data?.groups.find((x) => x.id === groupId);
  const label = groupName(groupId, g?.name);
  return (
    <>
      <Headline line1="send your" line2="first dare." accent="violet" />
      <p className="-mt-2 text-[17px] text-muted">to anyone in {label}. pick one, you set the bounty next.</p>
      <StaggerList className="flex flex-col gap-5">
        {FIRST_DARES.map((text) => (
          <StaggerItem key={text} className="raised flex items-end justify-between gap-3 p-5">
            <DareText text={text} size="sm" className="min-w-0 flex-1" />
            <PillLink href={withMock(`/new?group=${groupId}&text=${encodeURIComponent(text)}`, mock)} aria-label={`send it: ${text}`}>
              send it
            </PillLink>
          </StaggerItem>
        ))}
      </StaggerList>
      <PillLink href={withMock("/home", mock)} variant="ghost" full>
        skip, just look around
      </PillLink>
    </>
  );
}
