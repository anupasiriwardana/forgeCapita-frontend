"use client";

import { useQuery, type UseQueryResult } from "@tanstack/react-query";
import { getMinimumGoal, type MinimumGoalDto } from "@/lib/api";

const POLL_MS = 60_000;

/** Gas-based minimum funding goal for a chain, refreshed every minute. */
export function useMinimumGoal(chainId: number): UseQueryResult<MinimumGoalDto> {
  return useQuery({
    queryKey: ["minimum-goal", chainId],
    queryFn: ({ signal }) => getMinimumGoal(chainId, signal),
    refetchInterval: POLL_MS,
    retry: 1,
  });
}
