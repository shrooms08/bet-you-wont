"use client";

import { AnimatePresence, motion } from "motion/react";
import QRCode from "qrcode";
import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import type { Session } from "@/hooks/data";
import { describeError } from "@/lib/errors";
import { splitKeyPhrase } from "@/lib/format";
import { springs } from "@/lib/motion";
import { plainError } from "@/lib/plainErrors";
import { CopyIcon, ShareIcon, XIcon } from "../ui/icons";
import { PillButton } from "../ui/PillButton";

/** Bottom sheet on phones, centered modal on tablet/desktop. Escape and backdrop close it. */
export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const titleId = useId();
  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <motion.div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/60 tab:items-center" onClick={onClose} initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} data-no-burst>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="raised max-h-[92dvh] w-full max-w-[460px] overflow-y-auto rounded-b-none p-5 pb-[calc(20px+env(safe-area-inset-bottom))] tab:rounded-b-[32px]"
        onClick={(e) => e.stopPropagation()}
        initial={{ y: 60, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 40, opacity: 0 }}
        transition={springs.smooth}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-[24px] uppercase leading-[0.95] tracking-[-0.02em]">
            {title}
          </h2>
          <button ref={closeRef} type="button" onClick={onClose} aria-label="close" className="press grid h-11 w-11 shrink-0 place-items-center rounded-full border-[3px] border-line bg-surface">
            <XIcon size={16} />
          </button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

/** QR code (ink on cream for scanners). */
export function Qr({ value, size = 220, label }: { value: string; size?: number; label: string }) {
  const [svg, setSvg] = useState<string | null>(null);
  useEffect(() => {
    let live = true;
    QRCode.toString(value, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#14141A", light: "#F2F0E6" } }).then((s) => live && setSvg(s));
    return () => {
      live = false;
    };
  }, [value]);
  return (
    <div
      className="mx-auto overflow-hidden rounded-[24px] border-[3px] border-line bg-cream p-2"
      style={{ width: size, height: size }}
      role="img"
      aria-label={label}
      dangerouslySetInnerHTML={svg ? { __html: svg } : undefined}
    />
  );
}

function CopyRow({ value, label }: { value: string; label: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <p className="field flex min-w-0 flex-1 items-center truncate text-[15px]">{value.replace(/^https?:\/\//, "")}</p>
      <PillButton
        variant="secondary"
        size="sm"
        aria-label={label}
        onClick={async () => {
          await navigator.clipboard.writeText(value);
          setCopied(true);
          setTimeout(() => setCopied(false), 1800);
        }}
      >
        <CopyIcon size={18} />
        <span aria-live="polite">{copied ? "copied" : "copy"}</span>
      </PillButton>
    </div>
  );
}

/** Invite sheet: wifie name, big QR of the /i/<code> link, copy, native share. */
export function InviteSheet({ code, wifie, onClose }: { code: string; wifie: string; onClose: () => void }) {
  const url = typeof window === "undefined" ? `/i/${code}` : `${window.location.origin}/i/${code}`;
  const canShare = typeof navigator !== "undefined" && typeof navigator.share === "function";
  return (
    <Sheet title={`invite to ${wifie}`} onClose={onClose}>
      <div className="flex flex-col gap-4">
        <p className="text-[15px] text-muted">scan it, or send the link. anyone with it can join this wifie.</p>
        <Qr value={url} size={240} label={`QR code for the invite link to ${wifie}`} />
        <CopyRow value={url} label="copy invite link" />
        {canShare && (
          <PillButton full onClick={() => void navigator.share({ title: "Bet You Won't", text: `join ${wifie} on bet you won't`, url }).catch(() => {})}>
            <ShareIcon size={18} /> share
          </PillButton>
        )}
      </div>
    </Sheet>
  );
}

/** Fetches the share card PNG (authenticated; dev mock mode uses the fixture render). */
async function fetchCard(s: Session, dareId: number): Promise<Blob> {
  if (s.mock) {
    const res = await fetch(`/api/og/dare/${dareId}?mock=1`, { cache: "no-store" });
    if (!res.ok) throw new Error(`share card failed (${res.status})`);
    return res.blob();
  }
  return s.byw.apiBlob(`/api/og/dare/${dareId}`);
}

/**
 * Share a dare: on phones that can share files, the native share sheet gets the PNG + text + link.
 * Otherwise a sheet with the card preview, "download image" and "copy link".
 */
export function useShareDare(s: Session) {
  const [sheet, setSheet] = useState<{ dareId: number; text: string; url: string; blobUrl: string | null; error: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  async function share(dareId: number, dareText: string | null) {
    const url = `${window.location.origin}/d/${dareId}`;
    const { key, rest } = splitKeyPhrase(dareText);
    const text = `bet you won't ${key}${rest}`;
    setBusy(true);
    try {
      const blob = await fetchCard(s, dareId);
      const file = new File([blob], `byw-dare-${dareId}.png`, { type: "image/png" });
      if (typeof navigator.canShare === "function" && navigator.canShare({ files: [file] })) {
        try {
          await navigator.share({ files: [file], text: `${text} ${url}`, title: "Bet You Won't" });
          return;
        } catch {
          // user closed the share sheet: fall through to our sheet
        }
      }
      setSheet({ dareId, text, url, blobUrl: URL.createObjectURL(blob), error: null });
    } catch (err) {
      setSheet({ dareId, text, url, blobUrl: null, error: plainError(describeError(err)) });
    } finally {
      setBusy(false);
    }
  }
  const close = () => {
    if (sheet?.blobUrl) URL.revokeObjectURL(sheet.blobUrl);
    setSheet(null);
  };
  const node = (
    <AnimatePresence>
      {sheet && (
        <Sheet title="share this dare" onClose={close}>
          <div className="flex flex-col gap-4">
            {sheet.blobUrl ? (
              // eslint-disable-next-line @next/next/no-img-element -- local preview of the generated card
              <img src={sheet.blobUrl} alt="share card for this dare" className="mx-auto max-h-[46dvh] rounded-[20px] border-[3px] border-line" />
            ) : (
              <p className="text-[15px] text-danger">{sheet.error ?? "couldn't make the image."}</p>
            )}
            {sheet.blobUrl && (
              <a href={sheet.blobUrl} download={`byw-dare-${sheet.dareId}.png`} className="press-lip inline-flex min-h-[52px] items-center justify-center rounded-full border-[3px] border-line bg-primary px-6 text-[18px] font-extrabold text-on-primary">
                download image
              </a>
            )}
            <CopyRow value={sheet.url} label="copy link to this dare" />
          </div>
        </Sheet>
      )}
    </AnimatePresence>
  );
  return { share, busy, node };
}
