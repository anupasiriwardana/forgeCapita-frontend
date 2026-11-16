"use client";

import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSignMessage } from "wagmi";
import { useAuth } from "@/components/web3/AuthProvider";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";
import { ProfileRequiredNotice } from "@/components/ProfileRequiredNotice";
import {
  ApiError,
  getMyVote,
  getTakeoverByProject,
  getTakeoverTally,
  postTakeoverVote,
  shortAddr,
  type PublicTakeoverCaseDto,
  type TakeoverResult,
  type TakeoverTallyDto,
  type VoteChoice,
} from "@/lib/api";
import { formatTokenAmount } from "@/lib/format";

const TALLY_POLL_MS = 30_000;
const CLOCK_MS = 1_000;

const RESULT_TEXT: Record<TakeoverResult, string> = {
  passed: "Passed",
  failed: "Failed",
  no_quorum: "No quorum",
};

function isUserRejection(err: unknown): boolean {
  if (typeof err !== "object" || err === null) return false;
  const e = err as { name?: unknown; code?: unknown; message?: unknown };
  return (
    e.name === "UserRejectedRequestError" ||
    e.code === 4001 ||
    (typeof e.message === "string" && /user rejected|user denied/i.test(e.message))
  );
}

function voteError(err: unknown): string {
  if (isUserRejection(err)) return "Signature cancelled";
  if (err instanceof ApiError) {
    if (err.status === 400) return "Check your device clock (signature time window) and try again";
    if (err.status === 403) return "You are not eligible to vote on this case";
    if (err.status === 409) return "Your vote is stale or the voting window has ended";
  }
  return "Could not submit your vote. Try again.";
}

/** Share of the snapshot total in tenths of a percent, as text. Total 0 shows 0%. */
function percentOf(part: string, total: string | null): string {
  if (total === null) return "0.0%";
  const whole = BigInt(total);
  if (whole === BigInt(0)) return "0.0%";
  const tenths = Number((BigInt(part) * BigInt(1000)) / whole);
  return `${(tenths / 10).toFixed(1)}%`;
}

function barWidth(part: string, total: string | null): string {
  if (total === null) return "0%";
  const whole = BigInt(total);
  if (whole === BigInt(0)) return "0%";
  const pct = Number((BigInt(part) * BigInt(100)) / whole);
  return `${Math.min(100, pct)}%`;
}

function countdown(endsAt: string | null, now: number): string {
  if (endsAt === null) return "";
  const left = new Date(endsAt).getTime() - now;
  if (left <= 0) return "Voting window ended";
  const totalSeconds = Math.floor(left / 1000);
  const days = Math.floor(totalSeconds / 86_400);
  const hours = Math.floor((totalSeconds % 86_400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  return `${days}d ${hours}h ${minutes}m ${seconds}s left`;
}

function useClock(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const timer = setInterval(() => setNow(Date.now()), CLOCK_MS);
    return () => clearInterval(timer);
  }, []);
  return now;
}

function TakeoverBody({ initial }: { initial: PublicTakeoverCaseDto }) {
  const id = initial.id;
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { allowed: writeAllowed } = useWriteAllowed();
  const { signMessageAsync } = useSignMessage();
  const now = useClock();
  const userAddress = user ? user.address.toLowerCase() : null;

  const { data: tally = initial } = useQuery<TakeoverTallyDto>({
    queryKey: ["takeover-tally", id],
    queryFn: ({ signal }) => getTakeoverTally(id, signal),
    initialData: initial,
    refetchInterval: (query) => (query.state.data?.status === "vote_open" ? TALLY_POLL_MS : false),
    retry: 1,
  });

  const myVoteKey = ["takeover-my-vote", id, userAddress];
  const { data: myVote } = useQuery({
    queryKey: myVoteKey,
    queryFn: ({ signal }) => getMyVote(id, signal),
    enabled: userAddress !== null && id !== "",
    retry: 1,
  });

  const vote = useMutation({
    mutationFn: async (choice: VoteChoice) => {
      if (!myVote || myVote.voteMessageTemplate === null) throw new Error("Voting is not available");
      const issuedAt = new Date().toISOString();
      const message = myVote.voteMessageTemplate.replace("{choice}", () => choice).replace("{issuedAt}", () => issuedAt);
      const signature = await signMessageAsync({ message });
      return postTakeoverVote(id, { choice, issuedAt, signature });
    },
    onSuccess: (posted) => {
      queryClient.setQueryData(["takeover-tally", id], posted.tally);
      void queryClient.invalidateQueries({ queryKey: myVoteKey });
    },
  });

  const closed = tally.status === "closed";
  const total = tally.snapshotTotalStaked;
  const quorumPercent = tally.quorumPercent ?? 0;
  const candidateIsMe = userAddress !== null && userAddress === tally.candidateWallet.toLowerCase();
  const canShowButtons = !closed && myVote !== undefined && myVote.canVote && myVote.eligible;

  return (
    <section className="glass-card" style={{ padding: "24px", marginBottom: "24px" }}>
      <h2 style={{ fontSize: "18px", marginBottom: "12px" }}>Developer takeover vote</h2>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
        Status: {closed ? "Closed" : "Voting open"}
        {closed && tally.result !== null ? `. Result: ${RESULT_TEXT[tally.result]}` : ""}
      </p>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
        Candidate: <span style={{ fontFamily: "monospace" }}>{shortAddr(tally.candidateWallet)}</span>
      </p>
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
        Snapshot block: {initial.snapshotBlock ?? "n/a"}. Snapshot total staked: {total === null ? "n/a" : formatTokenAmount(total)}
      </p>
      {!closed && <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>{countdown(tally.endsAt, now)}</p>}
      <p style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
        Yes: {percentOf(tally.yesWeight, total)} ({formatTokenAmount(tally.yesWeight)}). No: {percentOf(tally.noWeight, total)} ({formatTokenAmount(tally.noWeight)})
      </p>
      <div style={{ fontSize: "13px", color: "var(--text-secondary)", marginBottom: "4px" }}>
        Quorum: {percentOf(tally.votedWeight, total)} voted of {quorumPercent}% required
        {tally.quorumWeightRequired !== null ? ` (${formatTokenAmount(tally.quorumWeightRequired)} needed)` : ""}. Voters: {tally.voterCount}
      </div>
      <div className="progress-bar" style={{ height: "8px", marginBottom: "12px" }}>
        <div className="progress-fill" style={{ width: barWidth(tally.votedWeight, total) }} />
      </div>
      <p style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "12px" }}>Advisory only: the admin decides on-chain</p>

      {userAddress !== null && myVote !== undefined && (
        <>
          {myVote.myChoice !== null && (
            <p style={{ fontSize: "14px", marginBottom: "8px" }}>
              Your vote: {myVote.myChoice}
              {myVote.weight !== null ? ` (weight ${formatTokenAmount(myVote.weight)})` : ""}
            </p>
          )}
          {!myVote.eligible && !closed && (
            <p style={{ fontSize: "13px", color: "var(--text-muted)" }}>
              {candidateIsMe
                ? "Not eligible: the candidate cannot vote on their own takeover."
                : "Not eligible: only wallets that staked at the snapshot, other than the current developer and the candidate, can vote."}
            </p>
          )}
          {canShowButtons && (
            <>
              <ProfileRequiredNotice />
              <div style={{ display: "flex", gap: "12px" }}>
                {(["YES", "NO"] as const).map((choice) => (
                  <button
                    key={choice}
                    type="button"
                    className="btn-primary"
                    disabled={vote.isPending || !writeAllowed}
                    onClick={() => vote.mutate(choice)}
                  >
                    {vote.isPending && vote.variables === choice ? "Waiting…" : `Vote ${choice}`}
                  </button>
                ))}
              </div>
            </>
          )}
        </>
      )}
      {vote.isError && (
        <div role="alert" className="alert alert-error" style={{ marginTop: "12px" }}>
          {voteError(vote.error)}
        </div>
      )}
    </section>
  );
}

/** Public takeover vote panel; renders nothing unless the project has an opened or closed takeover case. */
export function TakeoverPanel({ chainId, escrowAddress }: { chainId: number; escrowAddress: string }) {
  const { data: found } = useQuery({
    queryKey: ["takeover-case", chainId, escrowAddress.toLowerCase()],
    queryFn: ({ signal }) => getTakeoverByProject(chainId, escrowAddress, signal),
    retry: 1,
  });
  if (!found || (found.status !== "vote_open" && found.status !== "closed")) return null;
  return <TakeoverBody initial={found} />;
}
