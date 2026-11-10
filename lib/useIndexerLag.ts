"use client";

import { useQuery } from "@tanstack/react-query";
import { fetchIndexerStatus } from "@/lib/api";

const LAG_THRESHOLD_SECONDS = 120;
const POLL_MS = 60_000;

/** True when the indexer's latest block for the chain is older than LAG_THRESHOLD_SECONDS. False on error or unknown chain. One shared poll for all callers. */
export function useIndexerLag(chainId: number): { behind: boolean } {
  const { data } = useQuery({
    queryKey: ["indexer-status"],
    queryFn: ({ signal }) => fetchIndexerStatus(signal),
    refetchInterval: POLL_MS,
    select: (status) => {
      const chain = Object.values(status).find((c) => c.id === chainId);
      const nowSeconds = Math.floor(Date.now() / 1000);
      return chain !== undefined && nowSeconds - chain.block.timestamp > LAG_THRESHOLD_SECONDS;
    },
  });

  return { behind: data === true };
}
