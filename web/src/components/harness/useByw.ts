"use client";

// The harness's hooks now live in src/hooks (shared with the real app). Re-exported here so the
// /dev harness keeps its original imports.
import { useQuery } from "@tanstack/react-query";
import type { Byw } from "@/hooks/useByw";
import type { Me } from "@/lib/types";

export { chainIdOf, HttpError, useByw, type Byw } from "@/hooks/useByw";
export { usePrice } from "@/hooks/data";
export type { DareView, Feed, Home, Me, MyGroup, PublicProfile } from "@/lib/types";

/** /api/me for harness sections (react-query dedupes). */
export function useMe(byw: Byw) {
  return useQuery({
    queryKey: ["me", byw.address],
    queryFn: () => byw.api<Me>("/api/me"),
    enabled: byw.authenticated && !!byw.address,
  });
}
