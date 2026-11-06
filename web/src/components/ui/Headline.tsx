/**
 * Two-line uppercase headline: line 1 in an accent, line 2 in cream.
 * accent "lime" for home/crews/onboarding, "violet" for group screens and some onboarding steps.
 */
export function Headline({
  line1,
  line2,
  accent = "lime",
  size = "md",
  as: Tag = "h1",
}: {
  line1: string;
  line2: string;
  accent?: "lime" | "violet";
  size?: "md" | "lg" | "xl";
  as?: "h1" | "h2";
}) {
  const sizes = {
    md: "text-[40px] tab:text-[48px] desk:text-[56px]",
    lg: "text-[44px] tab:text-[56px] desk:text-[64px]",
    xl: "text-[76px]",
  };
  return (
    <Tag className={`font-display uppercase leading-[0.92] tracking-[-0.03em] [overflow-wrap:anywhere] ${sizes[size]}`}>
      <span className={`block ${accent === "lime" ? "text-accent-2" : "text-accent"}`}>{line1}</span>
      <span className="block text-cream">{line2}</span>
    </Tag>
  );
}
