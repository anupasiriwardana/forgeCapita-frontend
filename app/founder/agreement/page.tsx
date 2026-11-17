"use client";

import { AgreementSection } from "@/components/founder/AgreementSection";
import { useFounderMe } from "@/components/founder/useFounderMe";

export default function FounderAgreementPage() {
  const { me, error, reload } = useFounderMe();
  return (
    <>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>Revenue share agreement</h1>
      {error && <div role="alert" className="alert alert-error">{error}</div>}
      {!error && !me && <p style={{ color: "var(--text-secondary)" }}>Loading...</p>}
      {me && <AgreementSection me={me} onChanged={reload} />}
    </>
  );
}
