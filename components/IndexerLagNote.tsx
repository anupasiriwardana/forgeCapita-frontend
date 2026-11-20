"use client";

import { Clock } from "lucide-react";
import { useIndexerLag } from "@/lib/useIndexerLag";

/** One note when the indexer lags on the chain, or on any of the chains when several are passed. */
export function IndexerLagNote({ chainId }: { chainId: number | ReadonlyArray<number> }) {
  const { behind } = useIndexerLag(chainId);
  if (!behind) return null;
  return (
    <p role="status" style={{ display: "flex", alignItems: "flex-start", gap: 6, fontSize: "12px", color: "var(--text-2)", margin: "0 0 12px" }}>
      <Clock size={13} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: "var(--warning)" }} />
      <span>
        The indexer is catching up, so figures that come from it (totals, history) may be a little out of date.
        On-chain values update immediately.
      </span>
    </p>
  );
}
