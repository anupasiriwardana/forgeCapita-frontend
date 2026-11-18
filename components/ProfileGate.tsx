"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { ButtonLink } from "@/components/ui/Button";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { useAuth } from "@/components/web3/AuthProvider";
import { isPublicReadRoute, isWriteRoute } from "@/lib/profileNav";

/** Sends users with an incomplete personal profile to /profile (write routes) or shows a banner (public pages). */
export function ProfileGate() {
  const { user, loading, profileIncomplete } = useAuth();
  const pathname = usePathname();
  const router = useRouter();
  const gated = user !== null && !loading && profileIncomplete && pathname !== "/profile";
  const redirect = gated && isWriteRoute(pathname);

  useEffect(() => {
    if (redirect) router.replace(`/profile?next=${encodeURIComponent(pathname)}`);
  }, [redirect, pathname, router]);

  if (!gated || !isPublicReadRoute(pathname)) return null;
  return (
    <InlineAlert
      tone="warning"
      className="profile-gate-banner"
      action={
        <ButtonLink href="/profile" variant="secondary" size="sm">
          Go to profile
        </ButtonLink>
      }
    >
      Complete your profile to continue using ForgeCapita.
    </InlineAlert>
  );
}
