"use client";

import { ShadowWalletInfo } from "@/components/InfoDialog";
import { WalletsSection } from "@/components/founder/WalletsSection";
import { useFounderMe } from "@/components/founder/useFounderMe";

export default function FounderWalletsPage() {
  const { me, error, reload } = useFounderMe();
  return (
    <>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>Shadow wallets <ShadowWalletInfo /></h1>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {!error && !me && <p style={{ color: "var(--text-secondary)" }}>Loading...</p>}
      {me && <WalletsSection me={me} onChanged={reload} />}
    </>
  );
}
