import { Suspense } from "react";
import { AppNav } from "@/components/app/AppNav";

// Logged-in screens share this layout so the nav persists across pages (its active pill glides).
export default function AppLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="min-h-dvh desk:flex">
      <Suspense fallback={<div className="hidden w-[260px] shrink-0 desk:block" />}>
        <AppNav kind="rail" />
      </Suspense>
      <div className="min-w-0 flex-1">{children}</div>
      <Suspense fallback={null}>
        <AppNav kind="bottom" />
      </Suspense>
    </div>
  );
}
