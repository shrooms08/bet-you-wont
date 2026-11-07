// Link previews (og:/twitter: tags) for /d/<id>. Pure; unit-tested in linkPreview.test.ts.
// Rule: only dares in a PUBLIC wifie get their own title, text and share-card image. Private
// wifies (and missing dares) get the generic BYW preview, so nothing private leaks into a
// link unfurl.
import { formatWif } from "@/lib/format";

export const SITE_TITLE = "Bet You Won't";
export const SITE_DESCRIPTION = "Dare your friends. Lock a bounty in $wif. Post proof, your wifie votes, you get paid.";
export const DEFAULT_OG_IMAGE = { url: "/og-default.png", width: 1200, height: 630, alt: "Bet You Won't: hold my wif" } as const;
export const CARD_SIZE = { width: 1080, height: 1920 } as const;

/** Only dares in a public wifie may render the no-auth share card. */
export function publicCardAllowed(group: { is_public: boolean } | null | undefined): boolean {
  return group?.is_public === true;
}

/** Changes whenever the card would look different, so CDNs and unfurlers cache one PNG per dare state. */
export function cardVersion(d: {
  state: string;
  outcome: string;
  proof_hash: string | null;
  text_hidden_at?: string | null;
  media_hidden_at?: string | null;
}): string {
  const proof = d.proof_hash ? d.proof_hash.replace(/^0x/, "").slice(0, 10) : "none";
  // hiding text or media after reports changes the card, so it changes the version too
  const hidden = `${d.text_hidden_at ? "t" : ""}${d.media_hidden_at ? "m" : ""}`;
  return `${d.state}-${d.outcome}-${proof}${hidden ? `-h${hidden}` : ""}`.toLowerCase().replace(/[^a-z0-9-]/g, "");
}

export type PreviewDare = {
  id: number;
  text: string | null;
  amount: string; // wei
  state: string;
  outcome: string;
  proof_hash: string | null;
  doerName: string | null; // "@tobi"
};

function status(d: PreviewDare): string {
  if (d.state === "Settled") {
    return ({ Passed: "passed", Failed: "failed", NoVotes: "no votes, refunded" } as Record<string, string>)[d.outcome] ?? "expired";
  }
  return ({ Open: "open", Accepted: "in progress", Voting: "voting now", Cancelled: "cancelled" } as Record<string, string>)[d.state] ?? d.state.toLowerCase();
}

export type Preview = {
  title: string;
  description: string;
  image: { url: string; width: number; height: number; alt: string };
  /** true when the image is this dare's public share card */
  card: boolean;
};

/** What a link to /d/<id> unfurls as. `group` is the dare's wifie (null when unknown). */
export function darePreview(dare: PreviewDare | null, group: { is_public: boolean } | null | undefined): Preview {
  const generic = { title: SITE_TITLE, image: { ...DEFAULT_OG_IMAGE }, card: false };
  if (!dare) return { ...generic, description: SITE_DESCRIPTION };
  if (!publicCardAllowed(group)) return { ...generic, description: "a dare in a private wifie. open the link to see it." };
  const text = (dare.text ?? "").replace(/^\s*bet you won'?t\s*/i, "").trim();
  const by = dare.doerName && (dare.state !== "Open" || dare.outcome !== "None") ? ` · ${dare.doerName}` : "";
  return {
    title: text ? `bet you won't ${text}` : `dare #${dare.id} · ${SITE_TITLE}`,
    description: `${formatWif(dare.amount)} $wif on the line · ${status(dare)}${by}`,
    image: {
      url: `/api/og/public/dare/${dare.id}?v=${cardVersion(dare)}`,
      ...CARD_SIZE,
      alt: text ? `share card: bet you won't ${text}` : `share card for dare #${dare.id}`,
    },
    card: true,
  };
}
