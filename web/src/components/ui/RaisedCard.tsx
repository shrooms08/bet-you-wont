import type { HTMLAttributes, ReactNode } from "react";

/** The base surface: 3px border, 32px radius, 6px solid lip. `highlight` = lime border ("start here"). */
export function RaisedCard({
  children,
  className = "",
  highlight,
  as: Tag = "div",
  ...rest
}: { children: ReactNode; className?: string; highlight?: boolean; as?: "div" | "section" | "article" | "li" } & HTMLAttributes<HTMLElement>) {
  return (
    <Tag className={`raised ${highlight ? "!border-primary" : ""} ${className}`} {...rest}>
      {children}
    </Tag>
  );
}

/** Small uppercase section label, e.g. "WAITING ON YOU". */
export function SectionLabel({ children, count, className = "" }: { children: ReactNode; count?: number; className?: string }) {
  return (
    <h2 className={`flex items-center gap-2.5 font-display text-[20px] uppercase leading-none tracking-normal ${className}`}>
      {children}
      {count !== undefined && count > 0 && (
        <span className="grid h-8 min-w-8 place-items-center rounded-full border-[3px] border-line bg-secondary px-2 text-[14px] text-on-secondary">
          {count}
        </span>
      )}
    </h2>
  );
}
