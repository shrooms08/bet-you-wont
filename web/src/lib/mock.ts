"use client";

import { useSyncExternalStore } from "react";

/**
 * Dev-only fixture mode: add ?mock=1 to any app URL to render it with fixture data and a fake
 * logged-in user (no Privy login). Used for screenshots and design review.
 *
 * `process.env.NODE_ENV` is inlined at build time, so in a production build this is the constant
 * `false` and the mock branches are dead code. Variants: ?mock=empty (no groups, no dares),
 * ?mock=external (external wallet on the wrong network).
 */
export const MOCK_ALLOWED = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_E2E_MOCK === "1"; // E2E: local builds only (next.config refuses it on Vercel)

export type MockMode = false | "full" | "empty" | "external";

function read(): MockMode {
  if (!MOCK_ALLOWED || typeof window === "undefined") return false;
  const v = new URLSearchParams(window.location.search).get("mock");
  if (v === "1" || v === "full") return "full";
  if (v === "empty" || v === "external") return v;
  return false;
}

const subscribe = (cb: () => void) => {
  window.addEventListener("popstate", cb);
  return () => window.removeEventListener("popstate", cb);
};

export function useMockMode(): MockMode {
  return useSyncExternalStore(subscribe, read, () => false);
}

/** Keeps ?mock=... on internal links while in mock mode. */
export function withMock(href: string, mode: MockMode): string {
  if (!mode) return href;
  const value = mode === "full" ? "1" : mode;
  const [path, hash] = href.split("#");
  const sep = path.includes("?") ? "&" : "?";
  return `${path}${sep}mock=${value}${hash ? `#${hash}` : ""}`;
}
