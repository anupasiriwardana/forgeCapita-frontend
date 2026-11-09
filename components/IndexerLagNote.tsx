"use client";

import { useIndexerLag } from "@/lib/useIndexerLag";

export function IndexerLagNote({ chainId }: { chainId: number }) {
  const { behind } = useIndexerLag(chainId);
  if (!behind) return null;
  return (
    <p style={{ fontSize: "12px", color: "var(--text-muted)", margin: "0 0 12px" }}>
      The indexer is catching up, so figures that come from it (totals, history) may be a little out of date.
      On-chain values update immediately.
    </p>
  );
}
