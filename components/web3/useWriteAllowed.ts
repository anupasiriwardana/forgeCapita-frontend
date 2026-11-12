"use client";

import { useAuth } from "@/components/web3/AuthProvider";

export const PROFILE_REQUIRED_MESSAGE = "Complete your profile to continue";

/** Write actions are blocked while the signed-in user's personal profile is explicitly incomplete. */
export function useWriteAllowed(): { allowed: boolean; reason: string | null } {
  const { profileIncomplete } = useAuth();
  return profileIncomplete
    ? { allowed: false, reason: PROFILE_REQUIRED_MESSAGE }
    : { allowed: true, reason: null };
}
