import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Terms · Bet You Won't",
  description: "The rules for using Bet You Won't.",
};

export default function TermsPage() {
  return (
    <LegalPage title="terms" intro="the short version: you're an adult, you keep dares safe and legal, and money moves by a public smart contract, not by us.">
      <LegalSection title="who can use it">
        <p>you must be 18 or older. by using bet you won&apos;t (BYW) you agree to these terms and to the <Link href="/guidelines">community guidelines</Link>.</p>
      </LegalSection>

      <LegalSection title="your safety is on you">
        <p>
          you&apos;re responsible for your own safety and for following the law where you are. only dare, accept and film things that are safe, legal and
          that everyone involved has agreed to. never pressure anyone into a dare. you can always say no, and no bounty is worth getting hurt.
        </p>
      </LegalSection>

      <LegalSection title="what byw is">
        <ul>
          <li>a peer-to-peer tool: friends dare each other and put up their own $wif.</li>
          <li>BYW takes no fees and never holds your funds. bounties sit in a public smart contract on Robinhood Chain until the contract pays them out.</li>
          <li>outcomes are decided by each wifie&apos;s votes under the contract&apos;s rules (shown in the app). we can&apos;t change a result or reverse a payout.</li>
          <li>onchain transactions are final. double-check before you send.</li>
        </ul>
      </LegalSection>

      <LegalSection title="content and accounts">
        <p>
          you keep ownership of what you post, and you let us store it and show it to the people who can see the dare (your wifie, or everyone for
          public-wifie dares, including share cards). we can hide or remove content and block accounts from using the app, for example after reports.
          we can&apos;t remove anything from the blockchain.
        </p>
      </LegalSection>

      <LegalSection title="no promises">
        <p>
          BYW is provided as is, without warranties of any kind. it may have bugs or downtime. to the extent the law allows, we&apos;re not liable for
          losses from using it, including lost or burned tokens, gas fees, or injuries from dares.
        </p>
        <p>nothing in BYW is financial, investment or gambling advice. $wif can lose value. only put up what you&apos;re fine losing.</p>
      </LegalSection>

      <LegalSection title="independence">
        <p>BYW is an independent project. it is not affiliated with, endorsed by or sponsored by Robinhood Chain or the companies that run it.</p>
      </LegalSection>

      <LegalSection title="changes and contact">
        <p>
          we may update these terms; the date above changes when we do. questions: <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </LegalSection>
    </LegalPage>
  );
}
