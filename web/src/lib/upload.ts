"use client";

import type { Byw } from "@/hooks/useByw";

/**
 * Asks our API for a signed upload URL, then PUTs the bytes straight to Supabase storage.
 * Returns the storage path to hand back to the API (profile avatarPath / proofs finalize).
 */
/** Proof uploads belong to a capture session (the media file, or a video's poster). */
export type UploadSession = { sessionId: string; role: "media" | "poster" };

export async function uploadFile(byw: Byw, kind: "avatar" | "proof", file: Blob, name = "", session?: UploadSession): Promise<string> {
  const mime = file.type || (name.toLowerCase().endsWith(".heic") ? "image/heic" : "");
  const { signedUrl, path } = await byw.api<{ signedUrl: string; path: string }>("/api/upload-url", {
    body: { kind, mime, size: file.size, ...(session ?? {}) },
  });
  const res = await fetch(signedUrl, {
    method: "PUT",
    cache: "no-store",
    headers: { "content-type": mime, "x-upsert": "false" },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return path;
}

/** Same as uploadFile, but reports progress 0..1 (XHR: fetch can't report upload progress). */
export async function uploadWithProgress(
  byw: Byw,
  kind: "avatar" | "proof",
  blob: Blob,
  mime: string,
  onProgress?: (f: number) => void,
  session?: UploadSession,
): Promise<string> {
  const { signedUrl, path } = await byw.api<{ signedUrl: string; path: string }>("/api/upload-url", {
    body: { kind, mime, size: blob.size, ...(session ?? {}) },
  });
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", signedUrl);
    xhr.setRequestHeader("content-type", mime);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.upload.onprogress = (e) => e.lengthComputable && onProgress?.(e.loaded / e.total);
    xhr.onload = () => (xhr.status >= 200 && xhr.status < 300 ? resolve() : reject(new Error(`Upload failed (${xhr.status})`)));
    xhr.onerror = () => reject(new Error("Upload failed: network error"));
    xhr.send(blob);
  });
  onProgress?.(1);
  return path;
}
