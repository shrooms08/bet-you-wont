"use client";

import { use } from "react";
import { Onboarding } from "./Onboarding";

export function InviteOnboarding({ params }: { params: Promise<{ code: string }> }) {
  const { code } = use(params);
  return <Onboarding inviteCode={code.toLowerCase()} />;
}
