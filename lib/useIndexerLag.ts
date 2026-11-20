"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIndexerStatus } from "@/lib/api";

const LAG_THRESHOLD_SECONDS = 120;
const POLL_MS = 60_000;

/**
 * True when the indexer's latest block for the chain (or any of the chains) is older than LAG_THRESHOLD_SECONDS.
 * False on error or unknown chain. One shared poll for all callers.
 */
export function useIndexerLag(chainIds: number | ReadonlyArray<number>): { behind: boolean } {
  const ids: ReadonlyArray<number> = typeof chainIds === "number" ? [chainIds] : chainIds;
  const { data } = useQuery({
    queryKey: ["indexer-status"],
    queryFn: ({ signal }) => fetchIndexerStatus(signal),
    refetchInterval: POLL_MS,
    select: (status) => {
      const nowSeconds = Math.floor(Date.now() / 1000);
      return Object.values(status).some((c) => ids.includes(c.id) && nowSeconds - c.block.timestamp > LAG_THRESHOLD_SECONDS);
    },
  });

  return { behind: data === true };
}
