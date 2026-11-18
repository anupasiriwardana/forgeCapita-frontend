"use client";

import { useReadContracts } from "wagmi";
import { ABIS } from "@/lib/contracts";

/** Upper bound on milestones per project; reads stop at the first failed index (no such milestone). */
const MAX_MILESTONES = 5;
const ADDRESS_REGEX = /^0x[0-9a-fA-F]{40}$/;
const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

export interface MilestoneOutline {
  index: number;
  description: string;
  /** Share of net funds released by this milestone, in whole percent (as stored on chain). */
  unlockPct: bigint;
  isVotingOpen: boolean;
  isExecuted: boolean;
}

/**
 * Read-only outline of a project's milestones from MilestoneEscrow.milestones(i), the same reads the
 * milestones page uses. `milestones` is null while loading or when no project is given.
 */
export function useMilestoneOutline(
  chainId: number | undefined,
  escrow: string | undefined,
): { milestones: MilestoneOutline[] | null } {
  const enabled = chainId !== undefined && escrow !== undefined && ADDRESS_REGEX.test(escrow);
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: Array.from({ length: MAX_MILESTONES }, (_, i) => ({
      address: (enabled ? escrow : ZERO_ADDRESS) as `0x${string}`,
      abi: ABIS.escrow,
      functionName: "milestones" as const,
      args: [BigInt(i)] as const,
      chainId,
    })),
    query: { enabled, refetchInterval: 30_000 },
  });

  if (!data) return { milestones: null };
  const milestones: MilestoneOutline[] = [];
  for (let i = 0; i < MAX_MILESTONES; i++) {
    const ms = data[i]?.result;
    if (!ms) break;
    milestones.push({ index: i, description: ms[0], unlockPct: ms[1], isVotingOpen: ms[2], isExecuted: ms[3] });
  }
  return { milestones };
}
