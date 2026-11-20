"use client";

import { TakeoverSection } from "@/components/founder/TakeoverSection";

export default function FounderTakeoverPage() {
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Takeover requests</h1>
          <p>Projects where staff nominated you as the new developer. Accept the request, then accept the developer role on-chain after the vote.</p>
        </div>
      </div>
      <TakeoverSection />
    </>
  );
}
