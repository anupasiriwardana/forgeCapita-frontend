"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { LogIn } from "lucide-react";
import { UserProfileForm } from "@/components/UserProfileForm";
import { useAuth } from "@/components/web3/AuthProvider";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Spinner } from "@/components/ui/Spinner";
import { safeNextPath } from "@/lib/profileNav";

function Loading() {
  return (
    <div className="gate-loading" role="status">
      <Spinner size={16} />
      Loading…
    </div>
  );
}

function ProfileContent() {
  const { user, loading, signIn } = useAuth();
  const next = safeNextPath(useSearchParams().get("next"));

  if (loading) return <Loading />;
  if (!user) {
    return (
      <Card>
        <EmptyState
          icon={<LogIn size={20} />}
          title="Sign in to complete your profile"
          action={<Button onClick={() => void signIn()}>Sign in</Button>}
        />
      </Card>
    );
  }
  return <UserProfileForm key={`${user.id}:${user.address.toLowerCase()}`} next={next} />;
}

export default function ProfilePage() {
  return (
    <div className="page-container page-container-narrow">
      <div className="page-title-row">
        <div>
          <h1>Your profile</h1>
          <p>Personal details are required before you can invest, apply or launch. Only you and authorised staff can see them.</p>
        </div>
      </div>
      <Suspense fallback={<Loading />}>
        <ProfileContent />
      </Suspense>
    </div>
  );
}
