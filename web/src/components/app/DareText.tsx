import { splitKeyPhrase } from "@/lib/format";

/** "bet you won't " + key phrase in lime + the rest, heavy lowercase. */
export function DareText({ text, size = "md", className = "" }: { text: string | null; size?: "sm" | "md" | "lg"; className?: string }) {
  const { key, rest } = splitKeyPhrase(text);
  const cls = { sm: "text-[18px]", md: "text-[22px]", lg: "text-[28px]" }[size];
  if (!key) return <p className={`${cls} font-extrabold leading-[1.1] tracking-[-0.04em] text-muted ${className}`}>a secret dare</p>;
  return (
    <p className={`${cls} font-extrabold lowercase leading-[1.1] tracking-[-0.04em] [overflow-wrap:anywhere] ${className}`}>
      bet you won&apos;t <span className="text-accent-2">{key}</span>
      {rest}
    </p>
  );
}
