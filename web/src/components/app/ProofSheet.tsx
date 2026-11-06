"use client";

import { useEffect, useId, useRef, useState } from "react";
import type { Actions } from "@/hooks/useActions";
import { useObjectUrl } from "@/hooks/useObjectUrl";
import type { DareView } from "@/lib/types";
import { CameraIcon, XIcon } from "../ui/icons";
import { PillButton } from "../ui/PillButton";
import { DareText } from "./DareText";

const ACCEPT = "image/jpeg,image/png,image/webp,image/heic,video/mp4,video/quicktime,video/webm";

/**
 * Bottom sheet for posting proof (the full dare-detail screen arrives in 3c-2b).
 * Same flow as the harness: upload -> /api/proofs/finalize -> submitProof.
 */
export function ProofSheet({ dare, actions, onClose }: { dare: DareView; actions: Actions; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const preview = useObjectUrl(file);
  const closeRef = useRef<HTMLButtonElement>(null);
  const titleId = useId();
  const busy = actions.busy === `proof:${dare.id}`;

  useEffect(() => {
    closeRef.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && !busy && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, busy]);

  async function post() {
    if (!file) return;
    const ok = await actions.submitProof(dare.id, file);
    if (ok) onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 tab:items-center" onClick={() => !busy && onClose()}>
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className="raised w-full max-w-[520px] rounded-b-none p-5 pb-[calc(20px+env(safe-area-inset-bottom))] tab:rounded-b-[32px]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <h2 id={titleId} className="font-display text-[26px] uppercase leading-[0.95] tracking-[-0.02em]">
            post proof
          </h2>
          <button
            ref={closeRef}
            type="button"
            onClick={onClose}
            disabled={busy}
            aria-label="close"
            className="press grid h-12 w-12 place-items-center rounded-full border-[3px] border-line bg-surface"
          >
            <XIcon size={16} />
          </button>
        </div>
        <DareText text={dare.text} size="sm" className="mb-4" />
        <label className="press flex min-h-40 cursor-pointer flex-col items-center justify-center gap-2 overflow-hidden rounded-[28px] border-[3px] border-dashed border-line bg-inset p-4 text-center">
          {preview && file?.type.startsWith("image/") ? (
            // eslint-disable-next-line @next/next/no-img-element -- local object URL preview
            <img src={preview} alt="your proof" className="max-h-56 rounded-2xl object-contain" />
          ) : preview ? (
            <video src={preview} className="max-h-56 rounded-2xl" muted playsInline controls />
          ) : (
            <>
              <CameraIcon size={32} />
              <span className="text-[17px] font-extrabold">take or pick a photo or clip</span>
              <span className="text-[14px] text-muted">jpg, png, webp, heic, mp4, mov, webm · up to 50 MB</span>
            </>
          )}
          <input type="file" accept={ACCEPT} className="sr-only" onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
        </label>
        <PillButton full size="lg" className="mt-5" disabled={!file} loading={busy} onClick={() => void post()}>
          post it
        </PillButton>
      </div>
    </div>
  );
}
