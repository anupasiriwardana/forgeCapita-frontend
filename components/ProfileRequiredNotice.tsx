"use client";

import Link from "next/link";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";

/** Explains why write buttons are disabled; renders nothing when writes are allowed. */
export function ProfileRequiredNotice() {
  const { allowed, reason } = useWriteAllowed();
  if (allowed) return null;
  return (
    <div role="alert" className="alert alert-warning" style={{ marginBottom: "16px" }}>
      <span>{reason}</span>
      <Link href="/profile" style={{ textDecoration: "underline", fontWeight: 600 }}>
        Go to profile
      </Link>
    </div>
  );
}
