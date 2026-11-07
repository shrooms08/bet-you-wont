import Link from "next/link";
import { CONTACT_EMAIL, LEGAL_LINKS } from "@/lib/legal";

/** terms · privacy · guidelines · contact. On the main screens, onboarding and the legal pages. */
export function LegalFooter({ className = "" }: { className?: string }) {
  return (
    <footer className={`text-center text-[13px] text-muted ${className}`}>
      <nav aria-label="legal" className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
        {LEGAL_LINKS.map((l, i) => (
          <span key={l.href} className="flex items-center gap-3">
            {i > 0 && <span aria-hidden>·</span>}
            <Link href={l.href} className="underline-offset-2 hover:underline">
              {l.label}
            </Link>
          </span>
        ))}
        <span aria-hidden>·</span>
        <a href={`mailto:${CONTACT_EMAIL}`} className="underline-offset-2 hover:underline">
          contact
        </a>
      </nav>
    </footer>
  );
}
