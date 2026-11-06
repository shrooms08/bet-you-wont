"use client";

import type { ReactNode } from "react";
import { formatUnits, type Hex } from "viem";
import { explorerTx, tokenSymbol } from "@/lib/contracts";
import { usePrice, type PublicProfile } from "./useByw";

export type TxState =
  | { status: "idle" }
  | { status: "working"; step: string; hash?: Hex }
  | { status: "done"; hash?: Hex; message: string }
  | { status: "error"; message: string; hash?: Hex };

export const IDLE: TxState = { status: "idle" };

export function TxView({ tx }: { tx: TxState }) {
  if (tx.status === "idle") return null;
  const hashLink =
    "hash" in tx && tx.hash ? (
      <a className={`${link} block break-all text-sm`} href={explorerTx(tx.hash)} target="_blank" rel="noreferrer">
        tx: {tx.hash}
      </a>
    ) : null;
  const tone = tx.status === "working" ? "text-neutral-300" : tx.status === "done" ? "text-green-400" : "text-red-400";
  const icon = tx.status === "working" ? "⏳" : tx.status === "done" ? "✅" : "❌";
  const text = tx.status === "working" ? tx.step : tx.message;
  return (
    <div className={`text-sm ${tone}`}>
      <span className="break-words">
        {icon} {text}
      </span>
      {hashLink}
    </div>
  );
}

/** "1,234.5 mWIF (~$1.57)". The USD part is hidden when the price API is down. */
export function Amount({ wei }: { wei: string | bigint | null | undefined }) {
  const price = usePrice();
  if (wei === null || wei === undefined) return <span>-</span>;
  const tokens = Number(formatUnits(BigInt(wei), 18));
  const usd = price.data?.usd;
  return (
    <span>
      {tokens.toLocaleString(undefined, { maximumFractionDigits: 4 })} {tokenSymbol}
      {usd ? (
        <span className="text-neutral-500"> (~${(tokens * usd).toLocaleString(undefined, { maximumFractionDigits: 2 })})</span>
      ) : null}
    </span>
  );
}

export function Who({ p }: { p: PublicProfile | null | undefined }) {
  if (!p) return <span className="text-neutral-500">anyone</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {p.avatarUrl ? (
        // eslint-disable-next-line @next/next/no-img-element -- harness page; avatars come from Supabase storage
        <img
          src={p.avatarUrl}
          alt=""
          className="h-5 w-5 rounded-full object-cover"
          style={{ outline: `2px solid ${p.ringColor ?? "#555"}` }}
        />
      ) : (
        <span className="inline-block h-5 w-5 rounded-full" style={{ background: p.ringColor ?? "#555" }} />
      )}
      {p.username ? `@${p.username}` : `${p.wallet.slice(0, 6)}…${p.wallet.slice(-4)}`}
    </span>
  );
}

export function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className={card}>
      <h2 className="font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex flex-wrap gap-x-2 text-sm">
      <span className="w-28 shrink-0 text-neutral-500">{label}</span>
      <span className="min-w-0 break-all">{children}</span>
    </div>
  );
}

export function Shell({ children }: { children: ReactNode }) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-col gap-4 p-4 sm:p-6">
      <h1 className="text-2xl font-bold">Bet You Won&apos;t</h1>
      <p className="text-sm text-neutral-500">Phase 3c-1 test harness (testnet). Ugly on purpose; the real UI is 3c-2.</p>
      {children}
    </main>
  );
}

export const fmtTime = (iso: string | null) => (iso ? new Date(iso).toLocaleString() : "-");

export const btn =
  "rounded bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-500 disabled:cursor-not-allowed disabled:opacity-50";
export const btnGray = `${btn} bg-neutral-700 hover:bg-neutral-600`;
export const card = "flex flex-col gap-2 rounded border border-neutral-800 bg-neutral-900 p-4";
export const input = "rounded border border-neutral-700 bg-neutral-950 px-2 py-1 text-sm";
export const link = "text-indigo-400 underline";
