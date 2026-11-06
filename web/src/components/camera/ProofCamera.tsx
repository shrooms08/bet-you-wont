"use client";

import { AnimatePresence, motion } from "motion/react";
import { useCallback, useEffect, useRef, useState } from "react";
import { baseMime, drawReceipt, fitWithin, MAX_VIDEO_MS, PHOTO_MAX_SIDE, pickRecorderMime, receiptText, VIDEO_MAX_SIDE } from "@/lib/capture";
import { springs } from "@/lib/motion";
import { PillButton } from "../ui/PillButton";
import { XIcon } from "../ui/icons";

export type Capture = {
  blob: Blob;
  mime: string; // base mime for upload: image/jpeg | video/mp4 | video/webm
  kind: "photo" | "video";
  poster: Blob | null;
  durationMs: number | null;
  capturedAt: string;
  url: string; // object URL for review (revoked by the camera)
};

type Phase = "starting" | "live" | "recording" | "review" | "denied" | "nocamera" | "insecure" | "error";
type Facing = "user" | "environment";

const HOLD_MS = 350;
const RING_R = 42;
const RING_C = 2 * Math.PI * RING_R;

/** Dev-only test hook: the last capture's blobs, read by scripts/capture-check.mjs (never set in production). */
function exposeForTests(c: Capture) {
  if (process.env.NODE_ENV === "production") return;
  (window as unknown as { __bywLastCapture?: unknown }).__bywLastCapture = {
    kind: c.kind,
    mime: c.mime,
    size: c.blob.size,
    durationMs: c.durationMs,
    url: c.url,
    posterUrl: c.poster ? URL.createObjectURL(c.poster) : null,
    posterSize: c.poster?.size ?? null,
  };
}

function toBlob(canvas: HTMLCanvasElement, type: string, q: number) {
  return new Promise<Blob>((resolve, reject) => canvas.toBlob((b) => (b ? resolve(b) : reject(new Error("capture failed"))), type, q));
}

/**
 * Live-capture proof camera (full-screen sheet). Every capture gets a receipt burned in:
 * "BYW · @name · dare #id · date time · session code" + a lime corner mark.
 * Photo: tap the shutter. Video: hold the shutter (or switch to video and tap), max 30 s.
 */
export function ProofCamera({
  dareId,
  username,
  code,
  onClose,
  onUse,
  busy,
  progress,
  error,
}: {
  dareId: number;
  username: string | null;
  code: string;
  onClose: () => void;
  onUse: (c: Capture) => void;
  busy?: boolean;
  progress?: number | null;
  error?: string | null;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const workRef = useRef<HTMLCanvasElement | null>(null);
  const recRef = useRef<{ recorder: MediaRecorder; raf: number; start: number; timer: number } | null>(null);
  const holdRef = useRef<number | null>(null);
  const [phase, setPhase] = useState<Phase>("starting");
  const [facing, setFacing] = useState<Facing>(() =>
    typeof window !== "undefined" && window.matchMedia("(pointer: coarse)").matches ? "environment" : "user",
  );
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [elapsed, setElapsed] = useState(0);
  const [capture, setCapture] = useState<Capture | null>(null);
  const [hasAudio, setHasAudio] = useState(true);

  // ---- stream ---------------------------------------------------------------------------------
  const stopStream = () => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  };

  useEffect(() => {
    let cancelled = false;
    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) return setPhase(window.isSecureContext ? "nocamera" : "insecure");
      setPhase("starting");
      stopStream();
      const video = { facingMode: facing, width: { ideal: 1280 }, height: { ideal: 720 } };
      let stream: MediaStream;
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video, audio: true });
        setHasAudio(true);
      } catch (err) {
        const name = (err as DOMException).name;
        if (name === "NotFoundError" || name === "OverconstrainedError") {
          // maybe no mic or no camera on that side: try video only / any camera
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video: name === "OverconstrainedError" ? true : video });
            setHasAudio(false);
          } catch {
            return !cancelled && setPhase("nocamera");
          }
        } else if (name === "NotAllowedError" || name === "SecurityError") {
          // mic refused but camera may be allowed: try video only before giving up
          try {
            stream = await navigator.mediaDevices.getUserMedia({ video });
            setHasAudio(false);
          } catch {
            return !cancelled && setPhase("denied");
          }
        } else {
          return !cancelled && setPhase("error");
        }
      }
      if (cancelled) return stream.getTracks().forEach((t) => t.stop());
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
      }
      setPhase("live");
    }
    void start();
    return () => {
      cancelled = true;
    };
  }, [facing]);

  useEffect(
    () => () => {
      stopStream();
      if (recRef.current) cancelAnimationFrame(recRef.current.raf);
    },
    [],
  );

  // lock page scroll under the sheet
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, []);

  const canvas = () => (workRef.current ??= document.createElement("canvas"));
  const text = (d: Date) => receiptText({ username, dareId, date: d, code });

  // ---- photo ----------------------------------------------------------------------------------
  const takePhoto = useCallback(async () => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return;
    const at = new Date();
    const { w, h } = fitWithin(v.videoWidth, v.videoHeight, PHOTO_MAX_SIDE);
    const c = canvas();
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    ctx.drawImage(v, 0, 0, w, h);
    drawReceipt(ctx, w, h, text(at));
    const blob = await toBlob(c, "image/jpeg", 0.85);
    const shot: Capture = { blob, mime: "image/jpeg", kind: "photo", poster: null, durationMs: null, capturedAt: at.toISOString(), url: URL.createObjectURL(blob) };
    exposeForTests(shot);
    setCapture(shot);
    setPhase("review");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- text() only reads props
  }, [username, dareId, code]);

  // ---- video ----------------------------------------------------------------------------------
  const stopRecording = useCallback(() => {
    const r = recRef.current;
    if (r && r.recorder.state !== "inactive") r.recorder.stop();
  }, []);

  const startRecording = useCallback(() => {
    const v = videoRef.current;
    const stream = streamRef.current;
    if (!v || !stream || !v.videoWidth || typeof MediaRecorder === "undefined") return;
    const mimeType = pickRecorderMime((t) => MediaRecorder.isTypeSupported(t));
    if (!mimeType) return;
    const at = new Date();
    const label = text(at);
    const { w, h } = fitWithin(v.videoWidth, v.videoHeight, VIDEO_MAX_SIDE);
    const c = canvas();
    c.width = w;
    c.height = h;
    const ctx = c.getContext("2d")!;
    const draw = () => {
      ctx.drawImage(v, 0, 0, w, h);
      drawReceipt(ctx, w, h, label);
      if (recRef.current) recRef.current.raf = requestAnimationFrame(draw);
    };
    const out = c.captureStream(30);
    stream.getAudioTracks().forEach((t) => out.addTrack(t));
    const recorder = new MediaRecorder(out, { mimeType, videoBitsPerSecond: 2_500_000 });
    const chunks: Blob[] = [];
    let poster: Blob | null = null;
    recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    recorder.onstop = async () => {
      const r = recRef.current;
      if (r) {
        cancelAnimationFrame(r.raf);
        clearInterval(r.timer);
      }
      const durationMs = r ? performance.now() - r.start : null;
      recRef.current = null;
      out.getVideoTracks().forEach((t) => t.stop());
      const type = baseMime(mimeType);
      const blob = new Blob(chunks, { type });
      const cap: Capture = { blob, mime: type, kind: "video", poster, durationMs, capturedAt: at.toISOString(), url: URL.createObjectURL(blob) };
      exposeForTests(cap);
      setCapture(cap);
      setPhase("review");
    };
    recRef.current = { recorder, raf: 0, start: performance.now(), timer: 0 };
    draw();
    recorder.start(250);
    // poster: the first good frame (with the receipt), shortly after recording starts
    window.setTimeout(() => void toBlob(c, "image/jpeg", 0.85).then((b) => (poster = b)).catch(() => {}), 200);
    recRef.current.timer = window.setInterval(() => {
      const r = recRef.current;
      if (!r) return;
      const ms = performance.now() - r.start;
      setElapsed(ms);
      if (ms >= MAX_VIDEO_MS) stopRecording();
    }, 100);
    setElapsed(0);
    setPhase("recording");
    // eslint-disable-next-line react-hooks/exhaustive-deps -- text() only reads props
  }, [username, dareId, code, stopRecording]);

  // ---- shutter: tap = photo, hold = video (or video mode: tap toggles) ------------------------
  const onShutterDown = () => {
    if (phase !== "live" || mode === "video") return;
    holdRef.current = window.setTimeout(() => {
      holdRef.current = null;
      startRecording();
    }, HOLD_MS);
  };
  const onShutterUp = () => {
    if (mode === "video") return;
    if (phase === "recording") return stopRecording();
    if (holdRef.current !== null) {
      window.clearTimeout(holdRef.current);
      holdRef.current = null;
      void takePhoto();
    }
  };
  const onShutterClick = (e: React.MouseEvent) => {
    if (mode === "video") return phase === "recording" ? stopRecording() : startRecording();
    if (e.detail === 0) void takePhoto(); // keyboard (Enter/Space) in photo mode
  };

  const retake = () => {
    if (capture) URL.revokeObjectURL(capture.url);
    setCapture(null);
    setPhase("live");
  };
  useEffect(() => () => void (capture && URL.revokeObjectURL(capture.url)), [capture]);

  const recording = phase === "recording";
  const live = phase === "live" || recording;
  const ringOffset = RING_C * (1 - Math.min(1, elapsed / MAX_VIDEO_MS));

  return (
    <div className="fixed inset-0 z-[70] flex flex-col bg-black text-cream" role="dialog" aria-modal="true" aria-label="proof camera" data-no-burst>
      {/* top bar */}
      <div className="relative z-10 flex items-center justify-between gap-3 px-4 pb-2" style={{ paddingTop: "calc(env(safe-area-inset-top) + 12px)" }}>
        <button type="button" onClick={onClose} disabled={busy} aria-label="close camera" className="grid h-12 w-12 place-items-center rounded-full border-[3px] border-line bg-surface">
          <XIcon size={16} />
        </button>
        <p className="min-w-0 truncate rounded-full border-[3px] border-line bg-surface px-3 py-1.5 text-[13px] font-extrabold">
          dare #{dareId} · code <span className="text-primary">{code}</span>
        </p>
        {phase !== "review" ? (
          <button
            type="button"
            onClick={() => setFacing((f) => (f === "user" ? "environment" : "user"))}
            disabled={recording || busy}
            aria-label="flip camera"
            className="grid h-12 w-12 place-items-center rounded-full border-[3px] border-line bg-surface text-[18px]"
          >
            ⟲
          </button>
        ) : (
          <span className="w-12" />
        )}
      </div>

      {/* viewfinder / review */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video
          ref={videoRef}
          muted
          playsInline
          autoPlay
          aria-label="camera preview"
          className={`absolute inset-0 h-full w-full object-contain ${phase === "review" ? "invisible" : ""}`}
          style={{ transform: facing === "user" ? "scaleX(-1)" : undefined }}
        />
        {phase === "review" && capture && (
          <div className="absolute inset-0 grid place-items-center bg-black">
            {capture.kind === "photo" ? (
              // eslint-disable-next-line @next/next/no-img-element -- local capture preview
              <img src={capture.url} alt="your proof photo, with its receipt" className="max-h-full max-w-full object-contain" />
            ) : (
              <video src={capture.url} controls playsInline autoPlay muted className="max-h-full max-w-full" aria-label="your proof clip" />
            )}
          </div>
        )}
        {phase === "starting" && <p className="absolute inset-0 grid place-items-center text-[17px] text-muted">starting camera…</p>}
        {(phase === "denied" || phase === "nocamera" || phase === "insecure" || phase === "error") && <CameraHelp phase={phase} onClose={onClose} />}
        {/* receipt preview strip so people know it's burned in */}
        {live && (
          <p className="pointer-events-none absolute inset-x-0 bottom-0 truncate bg-bg/80 px-4 py-2 text-[12px] font-bold">
            <span className="mr-2 inline-block h-2.5 w-2.5 bg-primary align-middle" aria-hidden />
            {receiptText({ username, dareId, date: new Date(), code })}
          </p>
        )}
        {recording && (
          <p className="absolute left-1/2 top-3 -translate-x-1/2 rounded-full bg-danger px-3 py-1 text-[14px] font-extrabold text-on-danger" aria-live="polite">
            ● {Math.floor(elapsed / 1000)}s / 30s
          </p>
        )}
        {busy && progress != null && (
          <div className="absolute inset-x-6 bottom-12 rounded-[24px] border-[3px] border-line bg-surface p-4" role="status" aria-live="polite">
            <p className="text-[15px] font-extrabold">uploading proof… {Math.round(progress * 100)}%</p>
            <div className="mt-2 h-3 overflow-hidden rounded-full border-2 border-line bg-inset">
              <motion.div className="h-full origin-left bg-primary" style={{ originX: 0 }} animate={{ scaleX: progress }} transition={springs.smooth} />
            </div>
          </div>
        )}
      </div>

      {/* controls */}
      <div className="relative z-10 flex flex-col items-center gap-3 px-4 pt-4" style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 20px)" }}>
        {error && phase === "review" && (
          <p role="alert" className="max-w-[460px] text-center text-[15px] text-danger">
            {error}
          </p>
        )}
        <AnimatePresence mode="wait" initial={false}>
          {phase === "review" ? (
            <motion.div key="review" className="flex w-full max-w-[460px] gap-3" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
              <PillButton variant="ghost" size="lg" className="flex-1" onClick={retake} disabled={busy}>
                retake
              </PillButton>
              <PillButton size="lg" className="flex-1" loading={busy} onClick={() => capture && onUse(capture)}>
                use it
              </PillButton>
            </motion.div>
          ) : (
            <motion.div key="shoot" className="flex flex-col items-center gap-3" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
              <div className="flex gap-2 rounded-full border-[3px] border-line bg-surface p-1" role="radiogroup" aria-label="capture mode">
                {(["photo", "video"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    role="radio"
                    aria-checked={mode === m}
                    disabled={recording}
                    onClick={() => setMode(m)}
                    className={`min-h-11 rounded-full px-4 text-[15px] font-extrabold ${mode === m ? "bg-primary text-on-primary" : ""}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
              <button
                type="button"
                aria-label={mode === "video" ? (recording ? "stop recording" : "start recording") : recording ? "stop recording" : "take photo (hold to record video)"}
                disabled={!live}
                onPointerDown={onShutterDown}
                onPointerUp={onShutterUp}
                onPointerLeave={() => recording && mode === "photo" && stopRecording()}
                onClick={onShutterClick}
                onContextMenu={(e) => e.preventDefault()}
                className="relative grid h-[96px] w-[96px] touch-none select-none place-items-center disabled:opacity-50"
              >
                <svg width="96" height="96" viewBox="0 0 96 96" className="absolute inset-0 -rotate-90" aria-hidden>
                  <circle cx="48" cy="48" r={RING_R} fill="none" stroke="var(--byw-border)" strokeWidth="5" />
                  {recording && (
                    <circle cx="48" cy="48" r={RING_R} fill="none" stroke="var(--byw-danger)" strokeWidth="5" strokeLinecap="round" strokeDasharray={RING_C} strokeDashoffset={ringOffset} />
                  )}
                </svg>
                <span className={`block rounded-full transition-all ${recording ? "h-9 w-9 rounded-[10px] bg-danger" : mode === "video" ? "h-[70px] w-[70px] bg-danger" : "h-[70px] w-[70px] bg-cream"}`} />
              </button>
              <p className="text-[13px] text-muted">
                {mode === "photo" ? "tap for a photo · hold to record" : recording ? "tap to stop" : "tap to record (30s max)"}
                {!hasAudio && " · no mic: clips are silent"}
              </p>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function CameraHelp({ phase, onClose }: { phase: Phase; onClose: () => void }) {
  const title =
    phase === "denied" ? "camera is blocked" : phase === "insecure" ? "camera needs a secure page" : phase === "nocamera" ? "no camera found" : "couldn't start the camera";
  return (
    <div className="absolute inset-0 overflow-y-auto bg-bg p-6" role="alert">
      <div className="mx-auto flex max-w-[460px] flex-col gap-4">
        <h2 className="font-display text-[28px] uppercase leading-none">{title}</h2>
        <p className="text-[16px] text-muted">proof has to be shot live in the app, so we need your camera (and mic for clips).</p>
        {phase === "denied" && (
          <ul className="flex flex-col gap-3 text-[15px]">
            <li>
              <b>iPhone (Safari):</b> tap <b>aA</b> in the address bar → Website Settings → Camera and Microphone → Allow. Or Settings → Safari → Camera → Allow. Then reload.
            </li>
            <li>
              <b>Android (Chrome):</b> tap the lock (or settings) icon left of the address → Permissions → turn on Camera and Microphone, then reload.
            </li>
            <li>
              <b>Laptop/desktop:</b> click the camera icon (or the lock) in the address bar → Allow camera and microphone, then reload. On a Mac also check System Settings → Privacy & Security → Camera for your browser.
            </li>
          </ul>
        )}
        {phase === "nocamera" && <p className="text-[15px]">plug in or enable a webcam, or open this dare on your phone.</p>}
        {phase === "insecure" && <p className="text-[15px]">open the app over https (or localhost) to use the camera.</p>}
        <PillButton variant="ghost" onClick={onClose}>
          close
        </PillButton>
      </div>
    </div>
  );
}
