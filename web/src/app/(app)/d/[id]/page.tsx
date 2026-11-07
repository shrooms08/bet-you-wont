import type { Metadata } from "next";
import { connection } from "next/server";
import { Suspense } from "react";
import { DareRoute } from "@/components/screens/DareRoute";
import { Splash } from "@/components/ui/Splash";
import { previewForDare } from "@/server/previewData";

// Link preview: public-wifie dares unfurl with their own text and share card; private ones get the
// generic BYW preview (see src/server/linkPreview.ts).
// Request-time only: the dare's state changes, and a prerender must not start (then abort) the DB read.
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  await connection();
  const p = await previewForDare(Number((await params).id));
  return {
    title: p.title,
    description: p.description,
    openGraph: { type: "website", siteName: "Bet You Won't", title: p.title, description: p.description, images: [p.image] },
    twitter: { card: "summary_large_image", title: p.title, description: p.description, images: [{ url: p.image.url, alt: p.image.alt }] },
  };
}

// /d/<id>: one dare, every state.
export default function DarePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<Splash />}>
      <DareRoute params={params} />
    </Suspense>
  );
}
