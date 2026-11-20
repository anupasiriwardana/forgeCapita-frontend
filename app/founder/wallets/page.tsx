"use client";

import { ShadowWalletInfo } from "@/components/InfoDialog";
import { WalletsSection } from "@/components/founder/WalletsSection";
import { useFounderMe } from "@/components/founder/useFounderMe";
import { Card } from "@/components/ui/Card";
import { ErrorState } from "@/components/ui/ErrorState";
import { Skeleton } from "@/components/ui/Skeleton";

export default function FounderWalletsPage() {
  const { me, error, reload } = useFounderMe();
  return (
    <>
      <div className="page-title-row">
        <div>
          <div className="title-with-action">
            <h1>Shadow wallets</h1>
            <ShadowWalletInfo />
          </div>
          <p>The revenue wallets of your projects. Staff approve each address before you can launch with it.</p>
        </div>
      </div>
      {error && (
        <Card>
          <ErrorState title="Could not load your wallets" message={error} onRetry={reload} />
        </Card>
      )}
      {!error && !me && (
        <Card className="fp-card" aria-busy="true">
          <span className="sr-only" role="status">Loading...</span>
          <div className="stack-md">
            <Skeleton width="30%" height={16} />
            <Skeleton width="80%" />
            <Skeleton width="65%" />
          </div>
        </Card>
      )}
      {me && <WalletsSection me={me} onChanged={reload} />}
    </>
  );
}
