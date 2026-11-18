"use client";

import { FounderProjects } from "@/components/FounderProjects";

export default function FounderRevenuePage() {
  return (
    <>
      <div className="page-title-row">
        <div>
          <h1>Revenue</h1>
          <p>
            Revenue routed through each project&apos;s RevenueRouter, your claimable 24% creator share and the revenue
            compliance check. Amounts are per project in that chain&apos;s currency.
          </p>
        </div>
      </div>
      <FounderProjects view="revenue" />
    </>
  );
}
