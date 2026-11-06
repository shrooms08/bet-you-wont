"use client";

import type { Byw } from "./useByw";

/** Asks our API for a signed upload URL, then PUTs the file straight to Supabase storage. */
export async function uploadFile(byw: Byw, kind: "avatar" | "proof", file: File): Promise<string> {
  const mime = file.type || (file.name.toLowerCase().endsWith(".heic") ? "image/heic" : "");
  const { signedUrl, path } = await byw.api<{ signedUrl: string; path: string }>("/api/upload-url", {
    body: { kind, mime, size: file.size },
  });
  const res = await fetch(signedUrl, {
    method: "PUT",
    headers: { "content-type": mime, "x-upsert": "false" },
    body: file,
  });
  if (!res.ok) throw new Error(`Upload failed (${res.status}): ${(await res.text()).slice(0, 200)}`);
  return path;
}
