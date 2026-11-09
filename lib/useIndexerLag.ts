"use client";

import { useEffect, useState } from "react";
import { fetchIndexerStatus } from "@/lib/api";

const LAG_THRESHOLD_SECONDS = 120;
const POLL_MS = 60_000;

/** True when the indexer's latest block for the chain is older than LAG_THRESHOLD_SECONDS. False on error or unknown chain. */
export function useIndexerLag(chainId: number): { behind: boolean } {
  const [behind, setBehind] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    const { signal } = controller;

    function check(): void {
      fetchIndexerStatus(signal)
        .then((status) => {
          if (signal.aborted) return;
          const chain = Object.values(status).find((c) => c.id === chainId);
          const nowSeconds = Math.floor(Date.now() / 1000);
          setBehind(chain !== undefined && nowSeconds - chain.block.timestamp > LAG_THRESHOLD_SECONDS);
        })
        .catch(() => {
          if (!signal.aborted) setBehind(false);
        });
    }

    check();
    const timer = setInterval(check, POLL_MS);
    return () => {
      controller.abort();
      clearInterval(timer);
    };
  }, [chainId]);

  return { behind };
}
