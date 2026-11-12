"use client";

import { useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
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
    <div
      role="alert"
      className="alert alert-warning"
      style={{ position: "fixed", left: "16px", right: "16px", bottom: "16px", zIndex: 50, justifyContent: "center" }}
    >
      <span>Complete your profile to continue using ForgeCapita.</span>
      <Link href="/profile" style={{ textDecoration: "underline", fontWeight: 600 }}>
        Go to profile
      </Link>
    </div>
  );
}
