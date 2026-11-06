"use client";

import { useEffect, useState } from "react";
import type { Session } from "@/hooks/data";
import type { Actions } from "@/hooks/useActions";
import { describeError } from "@/lib/errors";
import { plainError } from "@/lib/plainErrors";
import type { ProofSession } from "@/lib/types";
import { ProofCamera, type Capture } from "./ProofCamera";

/**
 * "post proof": gets a 15-minute capture session, opens the camera, then uploads (with progress),
 * finalizes and calls submitProof. Closes itself when the proof is onchain.
 */
export function ProofFlow({ s, actions, dareId, onClose }: { s: Session; actions: Actions; dareId: number; onClose: () => void }) {
  const [session, setSession] = useState<ProofSession | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [progress, setProgress] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const busy = actions.busy === `proof:${dareId}`;

  useEffect(() => {
    let live = true;
    actions
      .startProofSession(dareId)
      .then((ses) => live && setSession(ses))
      .catch((err) => live && setFailed(plainError(describeError(err))));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one session per opening
  }, [dareId]);

  async function use(c: Capture) {
    if (!session) return;
    setError(null);
    setProgress(0);
    const ok = await actions.submitCapture(dareId, c, session, setProgress);
    setProgress(null);
    if (ok || s.mock) onClose();
    else setError("that didn't go through. check the message above, then try again or retake.");
  }

  if (failed) {
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-black/80 p-6" role="alertdialog" aria-label="can't open the camera" data-no-burst>
        <div className="raised max-w-[420px] p-6">
          <p className="text-[20px] font-extrabold">can&apos;t start proof</p>
          <p className="mt-2 text-[15px] text-muted">{failed}</p>
          <button type="button" className="mt-4 min-h-11 font-extrabold text-primary underline" onClick={onClose}>
            close
          </button>
        </div>
      </div>
    );
  }
  if (!session) {
    return (
      <div className="fixed inset-0 z-[70] grid place-items-center bg-black text-muted" role="status" data-no-burst>
        getting your proof code…
      </div>
    );
  }
  return (
    <ProofCamera
      dareId={dareId}
      username={s.profile?.username ?? null}
      code={session.code}
      onClose={onClose}
      onUse={(c) => void use(c)}
      busy={busy}
      progress={progress}
      error={error}
    />
  );
}
