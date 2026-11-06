// Pure project lifecycle helpers, mirroring forgecapita-indexer/src/projectState.ts.
// project.state is event-driven only; time-only transitions (the close grace expiring)
// emit no event, so the funding window is derived here from the current time.

import type { ProjectDto, ProjectState } from "@/lib/api";

export type FundingPhase = "OPEN" | "CLOSEABLE" | "REFUNDABLE" | "NOT_APPLICABLE";

export interface FundingPhaseInput {
  fundingDeadline: bigint;
  closeGrace: bigint;
  fundingClosed: boolean;
  goalReached: boolean;
  state: ProjectState;
}

function isTerminal(state: ProjectState): boolean {
  return (
    state === "COMPLETED" ||
    state === "FAILED" ||
    state === "CANCELLED" ||
    state === "SHUTDOWN"
  );
}

/** Crowdfunding window as of `now` (unix seconds). */
export function fundingPhase(now: bigint, input: FundingPhaseInput): FundingPhase {
  if (input.fundingClosed || isTerminal(input.state)) return "NOT_APPLICABLE";
  if (now <= input.fundingDeadline) return "OPEN";
  if (!input.goalReached) return "REFUNDABLE";
  if (now <= input.fundingDeadline + input.closeGrace) return "CLOSEABLE";
  return "REFUNDABLE";
}

export function refundsOpenFor(now: bigint, input: FundingPhaseInput): boolean {
  if (input.state === "COMPLETED") return false;
  if (input.state === "FAILED" || input.state === "CANCELLED") return true;
  if (input.state === "SHUTDOWN") return false;
  return fundingPhase(now, input) === "REFUNDABLE";
}

export function phaseInputOf(project: ProjectDto): FundingPhaseInput {
  return {
    fundingDeadline: BigInt(project.fundingDeadline),
    closeGrace: BigInt(project.closeGrace),
    fundingClosed: project.fundingClosedAt != null,
    goalReached: BigInt(project.totalRaised) >= BigInt(project.fundingGoal),
    state: project.state,
  };
}

/** COMPLETED always wins: a completed project is never shown as cancelled or shut down. */
export function displayState(project: ProjectDto): ProjectState {
  return project.state === "COMPLETED" ? "COMPLETED" : project.state;
}
