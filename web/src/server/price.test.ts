import { afterEach, describe, expect, it, vi } from "vitest";

const WIF = "0x5173b8ea6923c2d40267890d45c46a3480954773";

function mockFetch(handler: (url: string) => { ok: boolean; status?: number; body?: unknown }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const r = handler(String(url));
      return { ok: r.ok, status: r.status ?? (r.ok ? 200 : 500), json: async () => r.body };
    }),
  );
}

// Fresh module per test: the price module keeps a 60 s in-memory cache.
async function load() {
  vi.resetModules();
  return import("./price");
}

afterEach(() => vi.unstubAllGlobals());

describe("getWifPrice", () => {
  it("uses GeckoTerminal first, for the mainnet $wif token", async () => {
    const seen: string[] = [];
    mockFetch((url) => {
      seen.push(url);
      return { ok: true, body: { data: { attributes: { token_prices: { [WIF]: "0.00127" } } } } };
    });
    const { getWifPrice } = await load();
    expect(await getWifPrice()).toMatchObject({ usd: 0.00127, source: "geckoterminal" });
    expect(seen[0]).toContain(`/networks/robinhood/token_price/${"0x5173b8eA6923c2d40267890D45C46a3480954773"}`);
  });

  it("falls back to DexScreener's most liquid robinhood pair", async () => {
    mockFetch((url) =>
      url.includes("geckoterminal")
        ? { ok: false, status: 429 }
        : {
            ok: true,
            body: {
              pairs: [
                { chainId: "ethereum", baseToken: { address: WIF }, priceUsd: "9", liquidity: { usd: 1e9 } },
                { chainId: "robinhood", baseToken: { address: WIF }, priceUsd: "0.0011", liquidity: { usd: 10 } },
                { chainId: "robinhood", baseToken: { address: WIF }, priceUsd: "0.0013", liquidity: { usd: 5000 } },
              ],
            },
          },
    );
    const { getWifPrice } = await load();
    expect(await getWifPrice()).toMatchObject({ usd: 0.0013, source: "dexscreener" });
  });

  it("returns usd null when both sources fail, and caches the result", async () => {
    const calls = vi.fn();
    mockFetch(() => {
      calls();
      return { ok: false, status: 503 };
    });
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { getWifPrice } = await load();
    expect(await getWifPrice()).toMatchObject({ usd: null, source: null });
    await getWifPrice();
    expect(calls).toHaveBeenCalledTimes(2); // one per source, second call served from cache
  });
});
