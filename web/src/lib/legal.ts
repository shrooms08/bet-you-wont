/** Contact for legal, privacy and data requests. Set NEXT_PUBLIC_CONTACT_EMAIL in Vercel. */
export const CONTACT_EMAIL = process.env.NEXT_PUBLIC_CONTACT_EMAIL || "hello@example.com";

export const LEGAL_LINKS = [
  { href: "/terms", label: "terms" },
  { href: "/privacy", label: "privacy" },
  { href: "/guidelines", label: "guidelines" },
] as const;

/** When the terms, privacy notice and guidelines last changed. */
export const LEGAL_UPDATED = "7 november 2026";
