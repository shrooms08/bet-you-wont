"use client";

import { use } from "react";
import { ProfileScreen } from "./ProfileScreen";

export function UserRoute({ params }: { params: Promise<{ username: string }> }) {
  const { username } = use(params);
  return <ProfileScreen username={decodeURIComponent(username).toLowerCase()} />;
}
