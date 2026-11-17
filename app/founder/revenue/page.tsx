"use client";

import { FounderProjects } from "@/components/FounderProjects";

export default function FounderRevenuePage() {
  return (
    <>
      <h1 style={{ fontSize: "28px", marginBottom: "24px" }}>Revenue</h1>
      <FounderProjects view="revenue" />
    </>
  );
}
