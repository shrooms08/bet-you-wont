"use client";

import { useInfiniteQuery, useMutation, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useEffect } from "react";
import { useBalance, useReadContract } from "wagmi";
import { activeChain, tokenAbi, tokenAddress } from "@/lib/contracts";
import { MOCK_BALANCES, MOCK_HISTORY, MOCK_INVITE, MOCK_PUBLIC_GROUP, MOCK_WALLET, mockDare, mockFeed, mockFeedPage, mockHome, mockLeaderboard, mockMe, mockUser } from "@/lib/fixtures";
import { useMockMode } from "@/lib/mock";
import type { DareDetail, Feed, FeedPage, HistoryItem, Home, InvitePreview, Leaderboard, Me, Price, PublicGroup, UserPage } from "@/lib/types";
import { HttpError, useByw } from "./useByw";

async function publicGet<T>(path: string): Promise<T> {
  const res = await fetch(path, { cache: "no-store" });
  const body = (await res.json().catch(() => ({}))) as T & { error?: string };
  if (!res.ok) throw new HttpError(res.status, body.error ?? `request failed (${res.status})`);
  return body;
}

/**
 * Who is using the app. In ?mock mode: a fake logged-in user with a profile, no Privy.
 * `onboarded` = logged in and has an @name.
 */
export function useSession() {
  const mock = useMockMode();
  const byw = useByw();
  const live = byw.authenticated && !!byw.address && !mock;
  const me = useQuery({
    queryKey: ["me", mock || byw.address],
    queryFn: () =>
      mock ? Promise.resolve(mockMe(mock, new URLSearchParams(window.location.search).get("age") !== "0")) : byw.api<Me>("/api/me"),
    enabled: !!mock || live,
    staleTime: 15_000,
  });
  if (mock) {
    return {
      mock,
      byw,
      ready: true,
      authenticated: true,
      address: MOCK_WALLET as `0x${string}`,
      me,
      profile: me.data?.profile ?? null,
      onboarded: true,
      isEmbedded: mock !== "external",
      onRightChain: mock !== "external",
    };
  }
  return {
    mock,
    byw,
    ready: byw.ready,
    authenticated: byw.authenticated,
    address: byw.address,
    me,
    profile: me.data?.profile ?? null,
    onboarded: byw.authenticated && !!me.data?.profile,
    isEmbedded: byw.isEmbedded,
    onRightChain: byw.onRightChain,
  };
}

export type Session = ReturnType<typeof useSession>;

export function useHome(s: Session) {
  return useQuery({
    queryKey: ["home", s.mock || s.address],
    queryFn: () => (s.mock ? Promise.resolve(mockHome(s.mock)) : s.byw.api<Home>("/api/home")),
    enabled: !!s.mock || (s.authenticated && !!s.address),
  });
}

export function useFeed(s: Session, groupId: number | null) {
  return useQuery({
    queryKey: ["feed", groupId, s.mock || s.address],
    queryFn: () => (s.mock ? Promise.resolve(mockFeed(groupId!, s.mock)) : s.byw.api<Feed>(`/api/groups/${groupId}/feed`)),
    enabled: groupId !== null && (!!s.mock || (s.authenticated && !!s.address)),
    retry: (count, err) => !(err instanceof HttpError && [403, 404].includes(err.status)) && count < 2,
  });
}

/** GET /api/dares/<id> (members: full; public crews: read-only; private: 404). */
export function useDare(s: Session, dareId: number | null) {
  return useQuery({
    queryKey: ["dare", dareId, s.mock || s.address],
    queryFn: () => (s.mock ? Promise.resolve(mockDare(dareId!)) : s.byw.api<DareDetail>(`/api/dares/${dareId}`)),
    enabled: dareId !== null && (!!s.mock || (s.authenticated && !!s.address)),
    retry: (count, err) => !(err instanceof HttpError && [403, 404].includes(err.status)) && count < 2,
  });
}

/** GET /api/feed, 10 per page, cursor pagination. */
export function useFeedPosts(s: Session) {
  return useInfiniteQuery({
    queryKey: ["posts", s.mock || s.address],
    queryFn: ({ pageParam }) =>
      s.mock ? Promise.resolve(mockFeedPage(s.mock)) : s.byw.api<FeedPage>(`/api/feed${pageParam ? `?cursor=${encodeURIComponent(pageParam)}` : ""}`),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor,
    enabled: !!s.mock || (s.authenticated && !!s.address),
  });
}

/** 🔥 toggle with optimistic updates on the feed and the dare detail caches. */
export function useReaction(s: Session) {
  const qc = useQueryClient();
  const patch = (dareId: number, fn: (reacted: boolean, count: number) => { reacted: boolean; count: number }) => {
    qc.setQueriesData<InfiniteData<FeedPage>>({ queryKey: ["posts"] }, (data) =>
      data
        ? {
            ...data,
            pages: data.pages.map((p) => ({
              ...p,
              items: p.items.map((it) => {
                if (it.id !== dareId) return it;
                const next = fn(!!it.reacted, it.reactionCount ?? 0);
                return { ...it, reacted: next.reacted, reactionCount: next.count };
              }),
            })),
          }
        : data,
    );
    qc.setQueriesData<DareDetail>({ queryKey: ["dare", dareId] }, (data) => {
      if (!data) return data;
      const next = fn(!!data.dare.reacted, data.dare.reactionCount ?? 0);
      return { ...data, dare: { ...data.dare, reacted: next.reacted, reactionCount: next.count } };
    });
  };
  return useMutation({
    mutationFn: (dareId: number) =>
      s.mock ? Promise.resolve(null) : s.byw.api<{ reacted: boolean; count: number }>("/api/reactions", { body: { dareId } }),
    onMutate: (dareId) => patch(dareId, (r, c) => ({ reacted: !r, count: Math.max(0, c + (r ? -1 : 1)) })),
    onError: (_e, dareId) => patch(dareId, (r, c) => ({ reacted: !r, count: Math.max(0, c + (r ? -1 : 1)) })), // roll back
    onSuccess: (res, dareId) => res && patch(dareId, () => res),
  });
}

/** GET /api/users/<username>: profile, stats and the proof grid. */
export function useUser(s: Session, username: string | null) {
  return useQuery({
    queryKey: ["user", username, s.mock || s.address],
    queryFn: () => (s.mock ? Promise.resolve(mockUser(username!)) : s.byw.api<UserPage>(`/api/users/${encodeURIComponent(username!)}`)),
    enabled: !!username && (!!s.mock || (s.authenticated && !!s.address)),
    retry: (count, err) => !(err instanceof HttpError && err.status === 404) && count < 2,
  });
}

export function useLeaderboard(s: Session, groupId: number, period: "week" | "all", enabled = true) {
  return useQuery({
    queryKey: ["leaderboard", groupId, period, s.mock || s.address],
    queryFn: () => (s.mock ? Promise.resolve(mockLeaderboard(period)) : s.byw.api<Leaderboard>(`/api/groups/${groupId}/leaderboard?period=${period}`)),
    enabled: enabled && (!!s.mock || (s.authenticated && !!s.address)),
  });
}

export function useWalletHistory(s: Session) {
  return useQuery({
    queryKey: ["history", s.mock || s.address],
    queryFn: () => (s.mock ? Promise.resolve({ items: MOCK_HISTORY }) : s.byw.api<{ items: HistoryItem[] }>("/api/wallet/history")),
    enabled: !!s.mock || (s.authenticated && !!s.address),
  });
}

export function usePrice() {
  return useQuery({
    queryKey: ["price"],
    queryFn: () => publicGet<Price>("/api/price"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useInvitePreview(code: string | null) {
  const mock = useMockMode();
  return useQuery({
    queryKey: ["invite", code, mock],
    queryFn: () => (mock ? Promise.resolve(MOCK_INVITE) : publicGet<InvitePreview>(`/api/invite/${encodeURIComponent(code!)}`)),
    enabled: !!code,
    retry: false,
  });
}

export function usePublicGroup(id: number) {
  const mock = useMockMode();
  return useQuery({
    queryKey: ["public-group", id, mock],
    queryFn: () => (mock ? Promise.resolve(MOCK_PUBLIC_GROUP) : publicGet<PublicGroup>(`/api/groups/${id}/public`)),
    retry: false,
  });
}

/** ETH (for gas) and $wif balances of the active wallet. */
export function useBalances(s: Session) {
  const enabled = !s.mock && !!s.address;
  const eth = useBalance({ address: s.address, chainId: activeChain.id, query: { enabled, refetchInterval: 15_000 } });
  const wif = useReadContract({
    address: tokenAddress,
    abi: tokenAbi,
    functionName: "balanceOf",
    args: s.address ? [s.address] : undefined,
    chainId: activeChain.id,
    query: { enabled, refetchInterval: 15_000 },
  });
  if (s.mock) return { eth: MOCK_BALANCES.eth, wif: MOCK_BALANCES.wif, loading: false, refetch: () => {} };
  return {
    eth: eth.data?.value,
    wif: wif.data,
    loading: eth.isLoading || wif.isLoading,
    refetch: () => {
      void eth.refetch();
      void wif.refetch();
    },
  };
}

/**
 * While the tab is visible: every 20 s pull new chain events (/api/sync), then refresh home and feed.
 * Also runs once when the tab becomes visible again.
 */
export function useSyncLoop(enabled: boolean) {
  const queryClient = useQueryClient();
  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    const tick = async () => {
      if (document.visibilityState !== "visible") return;
      await fetch("/api/sync", { cache: "no-store" }).catch(() => null);
      if (stopped) return;
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ["home"] }),
        queryClient.invalidateQueries({ queryKey: ["feed"] }),
        queryClient.invalidateQueries({ queryKey: ["me"] }),
        queryClient.invalidateQueries({ queryKey: ["dare"] }),
        queryClient.invalidateQueries({ queryKey: ["posts"] }),
        queryClient.invalidateQueries({ queryKey: ["leaderboard"] }),
        queryClient.invalidateQueries({ queryKey: ["user"] }),
      ]);
    };
    const id = window.setInterval(() => void tick(), 20_000);
    const onVisible = () => document.visibilityState === "visible" && void tick();
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      stopped = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [enabled, queryClient]);
}
