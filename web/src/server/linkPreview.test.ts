import { describe, expect, it } from "vitest";
import { cardVersion, darePreview, DEFAULT_OG_IMAGE, publicCardAllowed, SITE_TITLE } from "./linkPreview";

const WIF = BigInt(10) ** BigInt(18);
const dare = {
  id: 36,
  text: "order in a fake accent at the suya spot",
  amount: (BigInt(10_000) * WIF).toString(),
  state: "Settled",
  outcome: "Passed",
  proof_hash: "0xabcdef0123456789",
  doerName: "@tobi",
};

describe("public share card visibility", () => {
  it("only public wifies get the no-auth card", () => {
    expect(publicCardAllowed({ is_public: true })).toBe(true);
    expect(publicCardAllowed({ is_public: false })).toBe(false);
    expect(publicCardAllowed(null)).toBe(false);
    expect(publicCardAllowed(undefined)).toBe(false);
  });
});

describe("link preview for /d/<id>", () => {
  it("public wifie: dare title, bounty and status, and the versioned public card", () => {
    const p = darePreview(dare, { is_public: true });
    expect(p.card).toBe(true);
    expect(p.title).toBe("bet you won't order in a fake accent at the suya spot");
    expect(p.description).toBe("10,000 $wif on the line · passed · @tobi");
    expect(p.image.url).toBe("/api/og/public/dare/36?v=settled-passed-abcdef0123");
    expect([p.image.width, p.image.height]).toEqual([1080, 1920]);
  });
  it("private wifie: generic image and text, nothing from the dare leaks", () => {
    const p = darePreview(dare, { is_public: false });
    expect(p.card).toBe(false);
    expect(p.image).toEqual({ ...DEFAULT_OG_IMAGE });
    expect(p.title).toBe(SITE_TITLE);
    const all = JSON.stringify(p);
    for (const leak of ["suya", "10,000", "tobi", "/api/og"]) expect(all).not.toContain(leak);
  });
  it("unknown wifie or missing dare: generic preview", () => {
    expect(darePreview(dare, null).card).toBe(false);
    expect(darePreview(null, { is_public: true })).toMatchObject({ title: SITE_TITLE, card: false, image: { url: "/og-default.png" } });
  });
  it("the card version changes with the dare state, so caches hold one PNG per state", () => {
    const open = cardVersion({ state: "Open", outcome: "None", proof_hash: null });
    const voting = cardVersion({ state: "Voting", outcome: "None", proof_hash: "0x1234" });
    const passed = cardVersion({ state: "Settled", outcome: "Passed", proof_hash: "0x1234" });
    expect(new Set([open, voting, passed]).size).toBe(3);
    expect(open).toBe("open-none-none");
    expect(cardVersion({ state: "Settled", outcome: "Passed", proof_hash: "0x1234" })).toBe(passed);
  });
  it("open dares don't name a doer; a leading 'bet you won't' isn't doubled", () => {
    const p = darePreview({ ...dare, text: "Bet you won't eat a raw onion", state: "Open", outcome: "None", doerName: "@ada" }, { is_public: true });
    expect(p.title).toBe("bet you won't eat a raw onion");
    expect(p.description).toBe("10,000 $wif on the line · open");
  });
});
