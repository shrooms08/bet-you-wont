import type { ReactNode } from "react";

/** Friendly empty state inside a raised card, with optional actions. */
export function EmptyState({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  return (
    <div className="raised flex flex-col gap-3 p-6">
      <p className="text-[22px] font-extrabold leading-tight tracking-[-0.04em]">{title}</p>
      {body && <p className="text-[16px] text-muted">{body}</p>}
      {children && <div className="mt-1 flex flex-wrap gap-3">{children}</div>}
    </div>
  );
}

/** Pulsing placeholder cards while data loads. */
export function Skeleton({ count = 2, height = 150 }: { count?: number; height?: number }) {
  return (
    <div className="flex flex-col gap-5" aria-busy="true" aria-label="loading">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} className="raised byw-shimmer" style={{ height }} />
      ))}
    </div>
  );
}

/** Scalloped "bottle cap" outcome badge (used on result screens in 3c-2b). */
export function ScallopBadge({
  label,
  tone = "passed",
  size = 176,
  animate = true,
}: {
  label: string;
  tone?: "passed" | "failed" | "expired";
  size?: number;
  animate?: boolean;
}) {
  const fill = { passed: "var(--byw-tag-passed-bg)", failed: "var(--byw-tag-failed-bg)", expired: "var(--byw-tag-expired-bg)" }[tone];
  const fg = { passed: "var(--byw-tag-passed-fg)", failed: "var(--byw-tag-failed-fg)", expired: "var(--byw-tag-expired-fg)" }[tone];
  return (
    <div className={`relative ${animate ? "animate-byw-pop" : "-rotate-[8deg]"}`} style={{ width: size, height: size }} role="img" aria-label={label}>
      <svg viewBox="0 0 220 220" width={size} height={size} className="absolute inset-0" style={{ filter: "drop-shadow(0 6px 0 var(--byw-lip))" }}>
        <path d={scallopPath(110, 110, 98, 86, 21)} fill={fill} stroke="var(--byw-border)" strokeWidth={7} strokeLinejoin="round" />
      </svg>
      <span
        className="absolute inset-0 grid place-items-center text-center font-display uppercase leading-none tracking-[-0.02em]"
        style={{ color: fg, fontSize: size / 6.3 }}
        aria-hidden
      >
        {label}
      </span>
    </div>
  );
}

/** Closed path alternating between outer and inner radius with smooth bumps. */
export function scallopPath(cx: number, cy: number, outer: number, inner: number, bumps: number): string {
  const pts: string[] = [];
  const steps = bumps * 2;
  for (let i = 0; i <= steps; i++) {
    const a = (i / steps) * Math.PI * 2 - Math.PI / 2;
    const r = i % 2 === 0 ? inner : outer;
    const x = (cx + r * Math.cos(a)).toFixed(1);
    const y = (cy + r * Math.sin(a)).toFixed(1);
    if (i === 0) pts.push(`M${x} ${y}`);
    else if (i % 2 === 1) pts.push(`Q${x} ${y}`);
    else pts.push(`${x} ${y}`);
  }
  return `${pts.join(" ")} Z`;
}
