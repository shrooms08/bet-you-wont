"use client";

import { notFound } from "next/navigation";
import { use } from "react";
import { GroupScreen } from "./GroupScreen";

export function GroupRoute({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  if (!/^[1-9][0-9]{0,15}$/.test(id)) notFound();
  return <GroupScreen groupId={Number(id)} />;
}
