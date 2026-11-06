import "server-only";
import { MAINNET_WIF_ADDRESS } from "@/lib/contracts";

// $wif USD price. GeckoTerminal first, DexScreener as fallback, cached 60 s in memory.
// Testnet mWIF has no market, so every network prices with the mainnet $wif token.

export type Price = { usd: number | null; source: "geckoterminal" | "dexscreener" | null; fetchedAt: string };

const CACHE_MS = 60_000;
const TIMEOUT_MS = 5_000;
let cached: { price: Price; at: number } | null = null;
let inflight: Promise<Price> | null = null;

async function getJson(url: string): Promise<unknown> {
  const res = await fetch(url, {
    headers: { accept: "application/json" },
    signal: AbortSignal.timeout(TIMEOUT_MS),
    cache: "no-store",
  });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

const positive = (v: unknown) => {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) && n > 0 ? n : null;
};

async function fromGeckoTerminal(token: string): Promise<number | null> {
  const body = (await getJson(
    `https://api.geckoterminal.com/api/v2/simple/networks/robinhood/token_price/${token}`,
  )) as { data?: { attributes?: { token_prices?: Record<string, string> } } };
  return positive(body.data?.attributes?.token_prices?.[token.toLowerCase()]);
}

async function fromDexScreener(token: string): Promise<number | null> {
  const body = (await getJson(`https://api.dexscreener.com/latest/dex/tokens/${token}`)) as {
    pairs?: Array<{ chainId?: string; baseToken?: { address?: string }; priceUsd?: string; liquidity?: { usd?: number } }>;
  };
  // Most liquid Robinhood Chain pair where $wif is the base token.
  const pairs = (body.pairs ?? [])
    .filter((p) => p.chainId === "robinhood" && p.baseToken?.address?.toLowerCase() === token.toLowerCase())
    .sort((a, b) => (b.liquidity?.usd ?? 0) - (a.liquidity?.usd ?? 0));
  return positive(pairs[0]?.priceUsd);
}

async function fetchPrice(): Promise<Price> {
  const fetchedAt = new Date().toISOString();
  for (const [source, fn] of [
    ["geckoterminal", fromGeckoTerminal],
    ["dexscreener", fromDexScreener],
  ] as const) {
    try {
      const usd = await fn(MAINNET_WIF_ADDRESS);
      if (usd !== null) return { usd, source, fetchedAt };
    } catch (err) {
      console.warn(`[price] ${source} failed:`, err instanceof Error ? err.message : String(err));
    }
  }
  return { usd: null, source: null, fetchedAt };
}

export async function getWifPrice(): Promise<Price> {
  if (cached && Date.now() - cached.at < CACHE_MS) return cached.price;
  inflight ??= fetchPrice().finally(() => {
    inflight = null;
  });
  const price = await inflight;
  // Failures are cached for 15 s (not 60) so a dead API isn't hammered but recovery is quick.
  cached = { price, at: price.usd === null ? Date.now() - CACHE_MS + 15_000 : Date.now() };
  return price;
}
