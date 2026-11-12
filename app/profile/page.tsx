"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { UserProfileForm } from "@/components/UserProfileForm";
import { useAuth } from "@/components/web3/AuthProvider";
import { safeNextPath } from "@/lib/profileNav";

function ProfileContent() {
  const { user, loading, signIn } = useAuth();
  const next = safeNextPath(useSearchParams().get("next"));

  if (loading) return <p style={{ color: "var(--text-secondary)" }}>Loading…</p>;
  if (!user) {
    return (
      <div className="alert alert-warning">
        <span>Sign in to complete your profile</span>
        <button type="button" className="btn-secondary" onClick={() => void signIn()}>Sign in</button>
      </div>
    );
  }
  return <UserProfileForm key={`${user.id}:${user.address.toLowerCase()}`} next={next} />;
}

export default function ProfilePage() {
  return (
    <div style={{ maxWidth: "720px", margin: "0 auto", padding: "40px 24px" }}>
      <h1 style={{ fontSize: "28px", marginBottom: "8px" }}>Your profile</h1>
      <p style={{ color: "var(--text-muted)", fontSize: "13px", marginBottom: "24px" }}>
        Personal details are required before you can invest, apply or launch. Only you and authorised staff can see them.
      </p>
      <Suspense fallback={<p style={{ color: "var(--text-secondary)" }}>Loading…</p>}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}
