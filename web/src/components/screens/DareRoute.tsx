"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { DareDetailScreen } from "./DareDetailScreen";

export function DareRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!/^[1-9][0-9]{0,15}$/.test(id)) notFound();
  return <DareDetailScreen dareId={Number(id)} />;
}
