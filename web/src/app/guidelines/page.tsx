import type { Metadata } from "next";
import { LegalPage, LegalSection } from "@/components/legal/LegalPage";
import { CONTACT_EMAIL } from "@/lib/legal";

export const metadata: Metadata = {
  title: "Guidelines · Bet You Won't",
  description: "What's ok to dare and post on Bet You Won't.",
};

export default function GuidelinesPage() {
  return (
    <LegalPage title="guidelines" intro="dares should be funny, a bit embarrassing, and safe. if it could hurt someone, it's not a dare.">
      <LegalSection title="not allowed">
        <ul>
          <li>dangerous stunts: heights, traffic, fire, weapons, drugs or alcohol challenges, anything that risks injury.</li>
          <li>anything illegal.</li>
          <li>filming people who haven&apos;t agreed to be in it.</li>
          <li>harassment, bullying, hate or threats.</li>
          <li>nudity or sexual content.</li>
          <li>anyone under 18 in a proof.</li>
          <li>sharing someone&apos;s private info.</li>
        </ul>
      </LegalSection>

      <LegalSection title="good dares">
        <ul>
          <li>harmless and a little embarrassing: sing, dance, compliment strangers, eat something weird (that&apos;s safe).</li>
          <li>everyone in the video is in on it.</li>
          <li>you&apos;d be fine with it on a share card.</li>
        </ul>
      </LegalSection>

      <LegalSection title="report it">
        <p>
          see something that breaks these? tap <b>⋯</b> on the post or dare and choose report. it&apos;s hidden for you right away, and after a few reports
          it&apos;s hidden for everyone until we review it. you can also email <a href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
        <p>we can hide content and block accounts in the app. onchain records stay, but they never include your photos or videos.</p>
      </LegalSection>
    </LegalPage>
  );
}
