import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy · Bet You Won't",
  description: "What Bet You Won't stores, why, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage title="privacy" intro="we keep what the app needs to work, nothing for ads, and you can delete it.">
      <LegalSection title="what we store">
        <ul>
          <li>login info, through Privy (your email or social login and the wallet it creates for you).</li>
          <li>your wallet address, @name and profile photo.</li>
          <li>dare text, proof photos and videos you post, votes and 🔥 reactions.</li>
          <li>reports you send, and a record of which wallet your account used to join the public wifie (to stop spam accounts).</li>
          <li>basic server logs (like ip addresses for rate limits), kept briefly.</li>
        </ul>
        <p>no ads, no tracking pixels, no selling data.</p>
      </LegalSection>

      <LegalSection title="why">
        <p>to log you in, show your wifies their dares and proofs, count votes and scores, keep the app safe (rate limits, reports, blocks), and answer you when you write to us.</p>
      </LegalSection>

      <LegalSection title="where it lives">
        <ul>
          <li>Supabase: our database and file storage.</li>
          <li>Vercel: runs the app and its servers.</li>
          <li>Privy: login and embedded wallets.</li>
          <li>the blockchain (Robinhood Chain): dares, bounties, joins, votes and proof fingerprints are public there by design.</li>
        </ul>
      </LegalSection>

      <LegalSection title="who sees your proofs">
        <p>
          proof files are private. we show them through short-lived private links, only to people who can see the dare: your wifie, or anyone signed in
          for dares in a public wifie. public-wifie dares can also appear on share cards and link previews.
        </p>
      </LegalSection>

      <LegalSection title="what can't be deleted">
        <p>anything onchain (dares, amounts, votes, joins, payouts and the proof fingerprint) is permanent and public. nobody, including us, can delete it.</p>
      </LegalSection>

      <LegalSection title="delete your data">
        <p>
          tap <b>delete my profile</b> on your profile page, or email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a> from your login email. it
          removes your profile, photo, proof files and reactions right away and frees your @name. copies can sit in our providers&apos; backups for a short
          while before they roll off.
        </p>
      </LegalSection>

      <LegalSection title="how long we keep files">
        <ul>
          <li>proof files: while the dare exists, until you delete your data or we remove them after a report.</li>
          <li>uploads that never became a proof (abandoned or retaken): deleted within about a day.</li>
          <li>old profile photos: deleted when you change it.</li>
        </ul>
      </LegalSection>

      <LegalSection title="contact">
        <p>
          questions or requests: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
