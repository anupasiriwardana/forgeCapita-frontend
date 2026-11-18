"use client";

import { useEffect, useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { useQueryClient, useSuspenseQuery } from "@tanstack/react-query";
import { useWriteContract, useWaitForTransactionReceipt, useAccount, useChainId, usePublicClient, useSignTypedData, useReadContracts } from "wagmi";
import { getFeeOverrides } from "@/lib/fees";
import { fetchMilestonesByProject, parseProjectId, type Milestone } from "@/lib/api";
import { ABIS } from "@/lib/contracts";
import { GaslessNotice, RelayStatus } from "@/components/RelayStatus";
import { useAuth } from "@/components/web3/AuthProvider";
import {
  describeRelayError,
  isTerminalStatus,
  newSignatureDeadline,
  relayVote,
  useRelayRequest,
  type RelayFailure,
} from "@/lib/relay";
import Link from "next/link";
import { ArrowLeft, CheckCircle2, Flag, Target, ThumbsDown, ThumbsUp } from "lucide-react";
import { barWidthPct, formatVotes, pctOfSupply } from "@/lib/format";
import { explorerTxUrl } from "@/lib/explorer";
import { toast } from "@/lib/toast";
import { isUserRejection, toastTxError, WALLET_CANCELLED_MESSAGE } from "@/lib/walletErrors";
import { Button } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Spinner } from "@/components/ui/Spinner";
import { StatusPill } from "@/components/ui/StatusPill";

/** Remaining voting time as text, from unix seconds (timestamps, not amounts). */
function timeLeft(end: string, now: number): string {
  const left = Number(end) - now;
  if (!Number.isFinite(left) || left <= 0) return "voting period ended";
  const days = Math.floor(left / 86_400);
  const hours = Math.floor((left % 86_400) / 3600);
  if (days > 0) return `${days}d ${hours}h left`;
  return `${hours}h ${Math.floor((left % 3600) / 60)}m left`;
}

function MilestoneCard({
  milestone,
  projectId,
  now,
  cancelled,
  isDeveloperWallet,
  hasVoted,
  publicSupply,
}: {
  publicSupply: bigint | null;
  milestone: Milestone;
  projectId: string;
  now: number;
  cancelled: boolean;
  isDeveloperWallet: boolean;
  hasVoted: boolean;
}) {
  const { isConnected, address } = useAccount();
  const { user } = useAuth();
  const { signTypedDataAsync } = useSignTypedData();
  const queryClient = useQueryClient();
  const relay = useRelayRequest();
  const [relayBusy, setRelayBusy] = useState(false);
  const [relayFailure, setRelayFailure] = useState<RelayFailure | null>(null);
  const [lastSupport, setLastSupport] = useState(true);
  const walletChainId = useChainId();
  const { writeContractAsync } = useWriteContract();
  const feeClient = usePublicClient({ chainId: parseProjectId(projectId).chainId });
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [voting, setVoting] = useState<"yes" | "no" | null>(null);
  const [voteStatus, setVoteStatus] = useState<"idle" | "pending" | "success" | "error">("idle");

  const { isLoading: isConfirming, isSuccess: receiptSuccess } = useWaitForTransactionReceipt({ hash: txHash });
  const relayStatus = relay.status;
  const relayActive = relayBusy || (relayStatus !== null && !isTerminalStatus(relayStatus));
  const relayConfirmed = relayStatus === "CONFIRMED";

  useEffect(() => {
    if (!relayConfirmed && !receiptSuccess) return;
    void queryClient.invalidateQueries({
      predicate: (q) => q.queryKey[0] === "readContracts" || (q.queryKey[0] === "milestones" && q.queryKey[1] === projectId),
    });
  }, [relayConfirmed, receiptSuccess, queryClient, projectId]);

  useEffect(() => {
    if (relayConfirmed || receiptSuccess) toast.success("Vote confirmed on-chain.");
  }, [relayConfirmed, receiptSuccess]);

  async function handleGaslessVote(support: boolean) {
    const { chainId, escrow } = parseProjectId(projectId);
    if (!isConnected || !address || !user) return;
    setLastSupport(support);
    setRelayFailure(null);
    relay.reset();
    if (walletChainId !== chainId) {
      setRelayFailure({ code: null, message: "Switch your wallet to this project's network" });
      return;
    }
    setRelayBusy(true);
    try {
      if (!feeClient) throw new Error("No RPC client for this chain");
      const milestoneIndex = await feeClient.readContract({
        address: escrow,
        abi: ABIS.escrow,
        functionName: "currentMilestoneIndex",
      });
      const deadline = newSignatureDeadline();
      const signature = await signTypedDataAsync({
        domain: { name: "ForgeCapita MilestoneEscrow", version: "1", chainId, verifyingContract: escrow },
        types: {
          Vote: [
            { name: "voter", type: "address" },
            { name: "milestoneIndex", type: "uint256" },
            { name: "support", type: "bool" },
            { name: "deadline", type: "uint256" },
          ],
        },
        primaryType: "Vote",
        message: { voter: address, milestoneIndex: BigInt(milestoneIndex), support, deadline: BigInt(deadline) },
      });
      const intake = await relayVote({ projectId, support, deadline, signature });
      relay.track(intake.id);
    } catch (err) {
      if (isUserRejection(err)) toast.info(WALLET_CANCELLED_MESSAGE);
      else setRelayFailure(describeRelayError(err));
    } finally {
      setRelayBusy(false);
    }
  }

  const votingEnd =
    milestone.isVotingOpen && milestone.votingEndTime && BigInt(milestone.votingEndTime) > BigInt(0)
      ? milestone.votingEndTime
      : null;
  const voteWindowOpen = votingEnd === null || BigInt(now) < BigInt(votingEnd);
  const canVote =
    milestone.isVotingOpen && !milestone.isExecuted && !hasVoted && !cancelled && !isDeveloperWallet && voteWindowOpen;
  const yesVotes = BigInt(milestone.yesVotes);
  const noVotes = BigInt(milestone.noVotes);
  const totalVotes = yesVotes + noVotes;
  const hasVotes = totalVotes > BigInt(0);
  const yesPct = hasVotes ? Number((yesVotes * BigInt(100)) / totalVotes) : 0;
  const noPct = hasVotes ? 100 - yesPct : 0;
  const supplyKnown = publicSupply !== null && publicSupply > BigInt(0);
  const fastTrackReached = supplyKnown && yesVotes > publicSupply / BigInt(2);
  const fastTrackNeeded = supplyKnown && !fastTrackReached ? publicSupply / BigInt(2) + BigInt(1) - yesVotes : BigInt(0);

  async function handleVote(support: boolean) {
    if (!isConnected) return;
    if (walletChainId !== parseProjectId(projectId).chainId) {
      setVoteStatus("error");
      toast.error("Switch your wallet to this project's network");
      return;
    }
    setVoting(support ? "yes" : "no");
    setVoteStatus("pending");
    try {
      const hash = await writeContractAsync({
        address: parseProjectId(projectId).escrow,
        abi: ABIS.escrow,
        functionName: "vote",
        args: [support],
        ...(await getFeeOverrides(feeClient)),
      });
      setTxHash(hash);
      setVoteStatus("success");
      toast.success(support ? "Yes vote submitted." : "No vote submitted.", { description: "Waiting for the transaction to confirm." });
    } catch (err) {
      setVoteStatus("error");
      toastTxError(err, "Vote failed");
    } finally {
      setVoting(null);
    }
  }

  const busyVote = relayActive || voteStatus === "pending" || isConfirming;
  const voted = voteStatus === "success" || relayConfirmed || hasVoted;

  return (
    <Card className="fade-in-up">
      <CardHeader
        title={`Milestone ${milestone.milestoneIndex + 1}`}
        subtitle={
          votingEnd ? (
            <span className="num">
              Voting ends {new Date(Number(votingEnd) * 1000).toLocaleString()} ({timeLeft(votingEnd, now)})
            </span>
          ) : undefined
        }
        actions={<StatusPill tone={milestone.isExecuted ? "success" : milestone.isVotingOpen ? "warning" : "neutral"}>{milestone.isExecuted ? "Executed" : milestone.isVotingOpen ? "Voting open" : "Pending"}</StatusPill>}
      />
      <CardBody>
        {supplyKnown ? (
          <div className="vote-bars">
            <div>
              <div className="vote-bar-head">
                <strong>Yes</strong>
                <span className="mono num">
                  {formatVotes(yesVotes)} ({pctOfSupply(yesVotes, publicSupply)}% of public supply)
                </span>
              </div>
              <div className="vote-track" aria-hidden="true">
                <div className="vote-fill" style={{ width: `${barWidthPct(yesVotes, publicSupply)}%` }} />
                <span className="vote-marker" style={{ left: "50%" }} />
              </div>
              <div className="vote-scale" aria-hidden="true">
                <span style={{ left: "50%" }}>Fast track 50%</span>
              </div>
            </div>
            <div>
              <div className="vote-bar-head">
                <strong>No</strong>
                <span className="mono num">
                  {formatVotes(noVotes)} ({pctOfSupply(noVotes, publicSupply)}% of public supply)
                </span>
              </div>
              <div className="vote-track" aria-hidden="true">
                <div className="vote-fill vote-fill-no" style={{ width: `${barWidthPct(noVotes, publicSupply)}%` }} />
              </div>
            </div>
            <div>
              <div className="vote-bar-head">
                <strong>Turnout</strong>
                <span className="mono num">{pctOfSupply(totalVotes, publicSupply)}% (quorum needs 20%)</span>
              </div>
              <div className="vote-track" aria-hidden="true">
                <div className="vote-fill" style={{ width: `${barWidthPct(totalVotes, publicSupply)}%`, background: "var(--text-2)" }} />
                <span className="vote-marker" style={{ left: "20%" }} />
              </div>
              <div className="vote-scale" aria-hidden="true">
                <span style={{ left: "20%" }}>Quorum 20%</span>
              </div>
            </div>
            <div className="vote-facts">
              {milestone.isVotingOpen && !milestone.isExecuted && (
                <span>
                  {fastTrackReached
                    ? "Fast track reached: execution is possible now"
                    : `Fast track: ${formatVotes(fastTrackNeeded)} more Yes needed (more than 50% of the public supply)`}
                </span>
              )}
              {hasVotes && <span className="num">Of votes cast: {yesPct}% Yes</span>}
            </div>
          </div>
        ) : (
          <div className="vote-bars">
            <div>
              <div className="vote-bar-head">
                <strong>Yes</strong>
                <span className="mono num">{formatVotes(yesVotes)} ({yesPct}%)</span>
              </div>
              <div className="vote-track" aria-hidden="true">
                <div className="vote-fill" style={{ width: `${yesPct}%` }} />
              </div>
            </div>
            <div>
              <div className="vote-bar-head">
                <strong>No</strong>
                <span className="mono num">{formatVotes(noVotes)} ({noPct}%)</span>
              </div>
              <div className="vote-track" aria-hidden="true">
                <div className="vote-fill vote-fill-no" style={{ width: `${noPct}%` }} />
              </div>
            </div>
          </div>
        )}

        {milestone.isVotingOpen && !milestone.isExecuted && (
          <div className="panel-section">
            {!isConnected ? (
              <InlineAlert tone="warning">Connect your wallet to vote.</InlineAlert>
            ) : voted ? (
              <InlineAlert tone="success">Your vote has been submitted.</InlineAlert>
            ) : !canVote ? (
              <InlineAlert tone="info">
                {cancelled
                  ? "This project is cancelled."
                  : isDeveloperWallet
                  ? "The developer wallet cannot vote."
                  : "The voting period for this milestone has ended."}
              </InlineAlert>
            ) : (
              <>
                <GaslessNotice />
                <div className="panel-actions">
                  <Button
                    loading={relayBusy && lastSupport}
                    leftIcon={<ThumbsUp size={16} aria-hidden="true" />}
                    onClick={() => void handleGaslessVote(true)}
                    disabled={!user || busyVote}
                  >
                    Vote Yes (gasless)
                  </Button>
                  <Button
                    variant="danger"
                    loading={relayBusy && !lastSupport}
                    leftIcon={<ThumbsDown size={16} aria-hidden="true" />}
                    onClick={() => void handleGaslessVote(false)}
                    disabled={!user || busyVote}
                  >
                    Vote No (gasless)
                  </Button>
                </div>
                <p className="panel-note" style={{ margin: "12px 0 6px", fontSize: 12 }}>Pay gas yourself</p>
                <div className="panel-actions">
                  <Button
                    variant="secondary"
                    loading={voting === "yes" && voteStatus === "pending"}
                    leftIcon={<ThumbsUp size={14} aria-hidden="true" />}
                    onClick={() => void handleVote(true)}
                    disabled={busyVote}
                  >
                    Vote Yes (pay gas)
                  </Button>
                  <Button
                    variant="secondary"
                    loading={voting === "no" && voteStatus === "pending"}
                    leftIcon={<ThumbsDown size={14} aria-hidden="true" />}
                    onClick={() => void handleVote(false)}
                    disabled={busyVote}
                  >
                    Vote No (pay gas)
                  </Button>
                </div>
              </>
            )}
            <RelayStatus
              chainId={parseProjectId(projectId).chainId}
              status={relayStatus}
              request={relay.request}
              pollError={relay.pollError}
              failure={relayFailure}
              onSelfPay={() => void handleVote(lastSupport)}
            />
            {txHash && isConfirming && (
              <p className="tx-status" role="status">
                <Spinner size={12} />
                Waiting for your vote transaction to confirm
                {explorerTxUrl(parseProjectId(projectId).chainId, txHash) && (
                  <a href={explorerTxUrl(parseProjectId(projectId).chainId, txHash) ?? undefined} target="_blank" rel="noopener noreferrer">
                    View transaction
                  </a>
                )}
              </p>
            )}
          </div>
        )}

        {milestone.isExecuted && (
          <InlineAlert tone="success" className="relay-failure">Milestone executed: funds released to the developer.</InlineAlert>
        )}

        {!milestone.isVotingOpen && !milestone.isExecuted && (
          <InlineAlert tone="info" className="relay-failure">Voting is not yet open for this milestone.</InlineAlert>
        )}
      </CardBody>
    </Card>
  );
}

const MAX_MILESTONES = 5;

function MilestonesContent({ id }: { id: string }) {
  const { data: indexed } = useSuspenseQuery({
    queryKey: ["milestones", id],
    queryFn: () => fetchMilestonesByProject(id),
  });
  const { address } = useAccount();
  const { chainId, escrow } = parseProjectId(id);
  const [now, setNow] = useState(() => Math.floor(Date.now() / 1000));

  useEffect(() => {
    const timer = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 10_000);
    return () => clearInterval(timer);
  }, []);

  const { data: headData } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: escrow, abi: ABIS.escrow, functionName: "projectCancelled", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "developer", chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "publicSupply", chainId },
    ],
    query: { refetchInterval: 10_000 },
  });

  const { data: chainData } = useReadContracts({
    allowFailure: true,
    contracts: [
      ...Array.from({ length: MAX_MILESTONES }, (_, i) => ({
        address: escrow,
        abi: ABIS.escrow,
        functionName: "milestones" as const,
        args: [BigInt(i)] as const,
        chainId,
      })),
    ],
    query: { refetchInterval: 10_000 },
  });

  // A failed read means no such milestone: stop at the first failure.
  const chainMilestones: Milestone[] = [];
  if (chainData) {
    for (let i = 0; i < MAX_MILESTONES; i++) {
      const ms = chainData[i]?.result;
      if (!ms) break;
      chainMilestones.push({
        id: `${id}:${i}`,
        projectId: id,
        milestoneIndex: i,
        isVotingOpen: ms[2],
        isExecuted: ms[3],
        votingEndTime: null,
        yesVotes: ms[4].toString(),
        noVotes: ms[5].toString(),
      });
    }
  }
  const onChain = chainMilestones.length > 0;
  const openIndex = chainMilestones.find((m) => m.isVotingOpen && !m.isExecuted)?.milestoneIndex;

  const { data: endData } = useReadContracts({
    allowFailure: true,
    contracts: [{ address: escrow, abi: ABIS.escrow, functionName: "votingEndTime", args: [BigInt(openIndex ?? 0)], chainId }],
    query: { enabled: openIndex !== undefined, refetchInterval: 10_000 },
  });
  const { data: votedData } = useReadContracts({
    allowFailure: true,
    contracts: [
      {
        address: escrow,
        abi: ABIS.escrow,
        functionName: "hasVoted",
        args: [BigInt(openIndex ?? 0), address ?? "0x0000000000000000000000000000000000000000"],
        chainId,
      },
    ],
    query: { enabled: openIndex !== undefined && !!address, refetchInterval: 10_000 },
  });
  const chainEnd = endData?.[0]?.result;
  const chainHasVoted = votedData?.[0]?.result;

  const milestones: Milestone[] = onChain
    ? chainMilestones.map((m) => {
        const fallbackEnd = indexed.find((x) => x.milestoneIndex === m.milestoneIndex)?.votingEndTime ?? null;
        const end = m.milestoneIndex === openIndex && typeof chainEnd === "bigint" ? chainEnd.toString() : fallbackEnd;
        return { ...m, votingEndTime: end };
      })
    : indexed;
  const cancelled = headData?.[0]?.result === true;
  const chainDeveloper = headData?.[1]?.result;
  const chainSupply = headData?.[2]?.result;
  const publicSupply = typeof chainSupply === "bigint" ? chainSupply : null;
  const isDeveloperWallet =
    typeof chainDeveloper === "string" && !!address && chainDeveloper.toLowerCase() === address.toLowerCase();

  const current = milestones.find((m) => m.isVotingOpen && !m.isExecuted) ?? null;
  const allExecuted = milestones.length > 0 && milestones.every((m) => m.isExecuted);
  const projectHref = `/projects/${encodeURIComponent(id)}`;

  return (
    <div className="page-container page-container-medium">
      <Link href={projectHref} className="page-back">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to project
      </Link>

      <div className="page-title-row fade-in-up">
        <div>
          <span className="eyebrow">Governance</span>
          <h1>Milestone voting</h1>
          <p>Review milestone progress and vote to release or withhold funds. Your staked tokens are your voting power.</p>
        </div>
      </div>

      <InlineAlert tone="info" title="How voting works" className="panel-gap">
        Once a milestone is open, token holders can vote Yes or No. If a milestone passes quorum, the developer receives the
        allocated funds. Failed milestones trigger a refund.
      </InlineAlert>

      {milestones.length === 0 ? (
        <Card>
          <EmptyState
            icon={<Target size={20} />}
            title="No milestones found"
            text="Milestones are indexed by Ponder once the project is funded and closed."
          />
        </Card>
      ) : (
        <div className="stack-md" style={{ gap: 16, marginTop: 16 }}>
          {cancelled && <InlineAlert tone="danger" title="Project cancelled">Milestones can no longer be executed. Investors can refund from the project page.</InlineAlert>}

          <section aria-labelledby="current-milestone-heading" className="stack-md">
            <h2 id="current-milestone-heading" style={{ fontSize: 16 }}>Current vote</h2>
            {current ? (
              <MilestoneCard
                key={current.id}
                milestone={current}
                projectId={id}
                now={now}
                cancelled={cancelled}
                publicSupply={publicSupply}
                isDeveloperWallet={isDeveloperWallet}
                hasVoted={current.milestoneIndex === openIndex && chainHasVoted === true}
              />
            ) : allExecuted ? (
              <InlineAlert tone="success">All milestones are executed.</InlineAlert>
            ) : (
              <InlineAlert tone="info">No milestone vote is open right now. The developer starts each vote from the project page.</InlineAlert>
            )}
          </section>

          <section aria-labelledby="history-heading" className="ui-card timeline-card">
            <h2 id="history-heading" style={{ fontSize: 16, marginBottom: 16 }}>All milestones</h2>
            <ol className="timeline">
              {milestones.map((m) => {
                const state = m.isExecuted ? "done" : m.isVotingOpen ? "current" : "upcoming";
                return (
                  <li key={m.id} className={`timeline-item is-${state}`}>
                    <span className="timeline-dot" aria-hidden="true">
                      {state === "done" ? <CheckCircle2 size={14} /> : state === "current" ? <Flag size={13} /> : <span className="num">{m.milestoneIndex + 1}</span>}
                    </span>
                    <div className="timeline-body">
                      <div className="timeline-head">
                        <span className="timeline-title">Milestone {m.milestoneIndex + 1}</span>
                        <StatusPill tone={state === "done" ? "success" : state === "current" ? "warning" : "neutral"}>
                          {state === "done" ? "Executed" : state === "current" ? "Voting open" : "Pending"}
                        </StatusPill>
                      </div>
                      <p className="timeline-meta mono num">
                        Yes {formatVotes(BigInt(m.yesVotes))} / No {formatVotes(BigInt(m.noVotes))}
                      </p>
                      {m.votingEndTime && state === "current" && (
                        <p className="timeline-meta num">
                          Voting ends {new Date(Number(m.votingEndTime) * 1000).toLocaleString()} ({timeLeft(m.votingEndTime, now)})
                        </p>
                      )}
                    </div>
                  </li>
                );
              })}
            </ol>
          </section>
        </div>
      )}
    </div>
  );
}

function decodeRouteId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function MilestonesPage() {
  const params = useParams();
  const id = decodeRouteId(params.id as string);

  return (
    <Suspense
      fallback={
        <div className="page-container page-container-medium" role="status" aria-live="polite">
          <span className="sr-only">Loading milestones</span>
          <Skeleton width={120} height={12} style={{ marginBottom: 20 }} />
          <Skeleton width="40%" height={28} style={{ marginBottom: 24 }} />
          <div className="stack-md" style={{ gap: 16 }}>
            {[1, 2].map(i => (
              <Card key={i} style={{ height: 180 }} aria-hidden="true" />
            ))}
          </div>
        </div>
      }
    >
      <MilestonesContent id={id} />
    </Suspense>
  );
}
