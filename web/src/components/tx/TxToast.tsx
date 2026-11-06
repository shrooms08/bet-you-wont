"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { explorerTx } from "@/lib/contracts";
import { plainError } from "@/lib/plainErrors";
import type { TxState } from "@/lib/tx";
import { CheckIcon, XIcon } from "../ui/icons";

type Toast = { id: number; title: string; tx: TxState };
type Ctx = { show: (title: string, tx: TxState) => void; dismiss: () => void; toast: Toast | null };

const TxToastContext = createContext<Ctx | null>(null);

export function TxToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<Toast | null>(null);
  const seq = useRef(0);
  const show = useCallback((title: string, tx: TxState) => {
    setToast((prev) => ({ id: prev && prev.title === title && prev.tx.status === "working" ? prev.id : ++seq.current, title, tx }));
  }, []);
  const dismiss = useCallback(() => setToast(null), []);
  const value = useMemo(() => ({ show, dismiss, toast }), [show, dismiss, toast]);
  return (
    <TxToastContext.Provider value={value}>
      {children}
      <TxToast toast={toast} onClose={dismiss} />
    </TxToastContext.Provider>
  );
}

export function useTxToast(): Ctx {
  const ctx = useContext(TxToastContext);
  if (!ctx) throw new Error("useTxToast needs <TxToastProvider>");
  return ctx;
}

function copyFor(tx: TxState): string {
  if (tx.status === "working") {
    if (tx.phase === "confirm") return "confirm in your wallet…";
    if (tx.phase === "sending") return "sending…";
    return tx.step.toLowerCase().replace(/^(checking network|simulating)…$/, "getting ready…");
  }
  if (tx.status === "done") return "done";
  if (tx.status === "error") return "failed, try again";
  return "";
}

/**
 * Transaction progress toast. Pinned to the top (clear of the bottom nav), announced to screen
 * readers. "done" fades after 6 s; errors stay until closed.
 */
export function TxToast({ toast, onClose }: { toast: Toast | null; onClose: () => void }) {
  useEffect(() => {
    if (toast?.tx.status !== "done") return;
    const t = window.setTimeout(onClose, 6000);
    return () => window.clearTimeout(t);
  }, [toast, onClose]);

  if (!toast || toast.tx.status === "idle") return null;
  const { tx } = toast;
  const hash = "hash" in tx ? tx.hash : undefined;
  const isError = tx.status === "error";
  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-50 flex justify-center px-4"
      style={{ top: "calc(env(safe-area-inset-top) + 12px)" }}
    >
      <div
        role={isError ? "alert" : "status"}
        aria-live={isError ? "assertive" : "polite"}
        className={`pointer-events-auto flex w-full max-w-[480px] items-start gap-3 rounded-[28px] border-[3px] border-line px-4 py-3 shadow-lip ${
          isError ? "bg-secondary text-on-secondary" : "bg-surface text-cream"
        }`}
      >
        <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center">
          {tx.status === "working" && (
            <span className="block h-6 w-6 animate-byw-spin rounded-full border-[3px] border-line border-t-primary" aria-hidden />
          )}
          {tx.status === "done" && (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-primary text-on-primary">
              <CheckIcon size={16} />
            </span>
          )}
          {isError && (
            <span className="grid h-7 w-7 place-items-center rounded-full bg-bg text-cream" aria-hidden>
              !
            </span>
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-display text-[13px] uppercase tracking-normal text-muted">{toast.title}</p>
          <p className="text-[17px] font-extrabold leading-tight">{copyFor(tx)}</p>
          {isError && <p className="mt-1 text-[15px] font-bold leading-snug">{plainError(tx.message)}</p>}
          {tx.status === "done" && tx.message && <p className="mt-0.5 text-[15px] text-muted">{tx.message}</p>}
          {hash && (tx.status === "done" || tx.status === "working") && (
            <a
              href={explorerTx(hash)}
              target="_blank"
              rel="noreferrer"
              className="mt-1 inline-block text-[15px] font-extrabold text-primary underline underline-offset-2"
            >
              receipt ↗
            </a>
          )}
        </div>
        {tx.status !== "working" && (
          <button
            type="button"
            onClick={onClose}
            aria-label="close"
            className="-mr-1 grid h-11 w-11 shrink-0 place-items-center rounded-full"
          >
            <XIcon size={16} />
          </button>
        )}
      </div>
    </div>
  );
}
