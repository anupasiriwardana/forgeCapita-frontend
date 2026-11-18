"use client";

import { AgreementSection } from "@/components/founder/AgreementSection";
import { useFounderMe } from "@/components/founder/useFounderMe";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

export default function FounderAgreementPage() {
  const { me, error, reload } = useFounderMe();
  return (
    <div className="content-narrow" style={{ maxWidth: 880 }}>
      <div className="page-title-row">
        <div>
          <h1>Revenue share agreement</h1>
          <p>Read the agreement, then sign it with your wallet. Signing is required before you can launch.</p>
        </div>
      </div>
      {error && (
        <Card>
          <ErrorState title="Could not load the agreement status" message={error} onRetry={reload} />
        </Card>
      )}
      {!error && !me && (
        <Card className="fp-card" aria-busy="true">
          <span className="sr-only" role="status">Loading...</span>
          <div className="stack-md">
            <Skeleton height={200} />
            <Skeleton width="50%" />
          </div>
        </Card>
      )}
      {me && <AgreementSection me={me} onChanged={reload} />}
    </div>
  );
}
