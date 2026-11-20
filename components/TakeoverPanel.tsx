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
  type PublicTakeoverCaseDto,
  type TakeoverResult,
  type TakeoverTallyDto,
  type VoteChoice,
} from "@/lib/api";
import { formatTokenAmount } from "@/lib/format";
import { toast, toastErrorWithRef } from "@/lib/toast";
import { isUserRejection, WALLET_CANCELLED_MESSAGE } from "@/lib/walletErrors";
import { ThumbsDown, ThumbsUp, UserCog } from "lucide-react";
import { AddressChip } from "@/components/ui/AddressChip";
import { Button } from "@/components/ui/Button";
import { CardBody, CardHeader } from "@/components/ui/Card";
import { StatusPill } from "@/components/ui/StatusPill";

const TALLY_POLL_MS = 30_000;
const CLOCK_MS = 1_000;

const RESULT_TEXT: Record<TakeoverResult, string> = {
  passed: "Passed",
  failed: "Failed",
  no_quorum: "No quorum",
};

function voteError(err: unknown): string {
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
      toast.success("Advisory vote recorded.");
    },
    onError: (err) => {
      if (isUserRejection(err)) toast.info(WALLET_CANCELLED_MESSAGE);
      else toastErrorWithRef(voteError(err), err);
    },
  });

  const closed = tally.status === "closed";
  const total = tally.snapshotTotalStaked;
  const quorumPercent = tally.quorumPercent ?? 0;
  const candidateIsMe = userAddress !== null && userAddress === tally.candidateWallet.toLowerCase();
  const canShowButtons = !closed && myVote !== undefined && myVote.canVote && myVote.eligible;

  return (
    <section className="ui-card">
      <CardHeader
        title={
          <span className="panel-title">
            <UserCog size={16} aria-hidden="true" />
            Developer takeover vote
          </span>
        }
        subtitle="Advisory only: the admin decides on-chain"
        actions={
          <StatusPill tone={closed ? (tally.result === "passed" ? "success" : "neutral") : "warning"}>
            {closed ? `Closed${tally.result !== null ? `: ${RESULT_TEXT[tally.result]}` : ""}` : "Voting open"}
          </StatusPill>
        }
      />
      <CardBody>
        <div className="kv-list">
          <div className="kv-row">
            <span>Candidate</span>
            <AddressChip address={tally.candidateWallet} />
          </div>
          <div className="kv-row">
            <span>Snapshot block</span>
            <span className="num">{initial.snapshotBlock ?? "n/a"}</span>
          </div>
          <div className="kv-row">
            <span>Snapshot total staked</span>
            <span className="num">{total === null ? "n/a" : formatTokenAmount(total)}</span>
          </div>
          {!closed && (
            <div className="kv-row">
              <span>Time left</span>
              <span className="num">{countdown(tally.endsAt, now)}</span>
            </div>
          )}
        </div>

        <div className="vote-bars panel-section">
          <div>
            <div className="vote-bar-head">
              <strong>Yes</strong>
              <span className="num">
                {percentOf(tally.yesWeight, total)} ({formatTokenAmount(tally.yesWeight)})
              </span>
            </div>
            <div className="vote-track" aria-hidden="true">
              <div className="vote-fill" style={{ width: barWidth(tally.yesWeight, total) }} />
            </div>
          </div>
          <div>
            <div className="vote-bar-head">
              <strong>No</strong>
              <span className="num">
                {percentOf(tally.noWeight, total)} ({formatTokenAmount(tally.noWeight)})
              </span>
            </div>
            <div className="vote-track" aria-hidden="true">
              <div className="vote-fill vote-fill-no" style={{ width: barWidth(tally.noWeight, total) }} />
            </div>
          </div>
          <div>
            <div className="vote-bar-head">
              <strong>Turnout</strong>
              <span className="num">
                {percentOf(tally.votedWeight, total)} voted of {quorumPercent}% required
                {tally.quorumWeightRequired !== null ? ` (${formatTokenAmount(tally.quorumWeightRequired)} needed)` : ""}
              </span>
            </div>
            <div className="vote-track" aria-hidden="true">
              <div className="vote-fill" style={{ width: barWidth(tally.votedWeight, total), background: "var(--text-2)" }} />
              <span className="vote-marker" style={{ left: `${Math.min(100, Math.max(0, quorumPercent))}%` }} />
            </div>
            <p className="panel-note" style={{ marginTop: 6, fontSize: 12 }}>
              Voters: <span className="num">{tally.voterCount}</span>
            </p>
          </div>
        </div>

        {userAddress !== null && myVote !== undefined && (
          <div className="panel-section stack-sm">
            {myVote.myChoice !== null && (
              <p style={{ fontSize: "14px" }}>
                Your vote: <strong>{myVote.myChoice}</strong>
                {myVote.weight !== null ? <span className="num"> (weight {formatTokenAmount(myVote.weight)})</span> : ""}
              </p>
            )}
            {!myVote.eligible && !closed && (
              <p className="panel-note">
                {candidateIsMe
                  ? "Not eligible: the candidate cannot vote on their own takeover."
                  : "Not eligible: only wallets that staked at the snapshot, other than the current developer and the candidate, can vote."}
              </p>
            )}
            {canShowButtons && (
              <>
                <ProfileRequiredNotice />
                <div className="panel-actions">
                  {(["YES", "NO"] as const).map((choice) => (
                    <Button
                      key={choice}
                      variant={choice === "YES" ? "primary" : "secondary"}
                      loading={vote.isPending && vote.variables === choice}
                      disabled={vote.isPending || !writeAllowed}
                      leftIcon={choice === "YES" ? <ThumbsUp size={16} aria-hidden="true" /> : <ThumbsDown size={16} aria-hidden="true" />}
                      onClick={() => vote.mutate(choice)}
                    >
                      Vote {choice}
                    </Button>
                  ))}
                </div>
              </>
            )}
          </div>
        )}
      </CardBody>
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
