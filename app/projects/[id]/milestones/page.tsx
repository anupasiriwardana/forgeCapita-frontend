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
import { barWidthPct, formatVotes, pctOfSupply } from "@/lib/format";

function MilestoneCard({
  milestone,
  projectId,
  index,
  now,
  cancelled,
  isDeveloperWallet,
  hasVoted,
  publicSupply,
}: {
  publicSupply: bigint | null;
  milestone: Milestone;
  projectId: string;
  index: number;
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
  const [voteError, setVoteError] = useState("");

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
      setRelayFailure(describeRelayError(err));
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
      setVoteError("Switch your wallet to this project's network");
      return;
    }
    setVoting(support ? "yes" : "no");
    setVoteStatus("pending");
    setVoteError("");
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
    } catch (err) {
      setVoteStatus("error");
      setVoteError(err instanceof Error ? err.message : "Vote failed");
    } finally {
      setVoting(null);
    }
  }

  const statusColor = milestone.isExecuted
    ? "var(--emerald)"
    : milestone.isVotingOpen
    ? "var(--amber)"
    : "var(--text-muted)";

  const statusLabel = milestone.isExecuted
    ? "Executed ✓"
    : milestone.isVotingOpen
    ? "Voting Open"
    : "Pending";

  return (
    <div
      className="glass-card fade-in-up"
      style={{
        padding: "24px",
        animationDelay: `${index * 0.08}s`,
        borderLeft: `3px solid ${statusColor}`,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
          <div
            style={{
              width: "36px",
              height: "36px",
              borderRadius: "50%",
              background: milestone.isExecuted
                ? "rgba(16,185,129,0.15)"
                : milestone.isVotingOpen
                ? "rgba(245,158,11,0.15)"
                : "rgba(255,255,255,0.05)",
              border: `1px solid ${statusColor}30`,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              fontWeight: 800,
              fontSize: "14px",
              color: statusColor,
            }}
          >
            {milestone.isExecuted ? "✓" : milestone.milestoneIndex + 1}
          </div>
          <div>
            <div style={{ fontWeight: 700, fontSize: "15px", color: "var(--text-primary)" }}>
              Milestone {milestone.milestoneIndex + 1}
            </div>
            <div style={{ fontSize: "12px", color: statusColor, fontWeight: 600 }}>{statusLabel}</div>
            {votingEnd && (
              <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                Voting ends {new Date(Number(votingEnd) * 1000).toLocaleString()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Vote counts */}
      {supplyKnown ? (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--emerald)", fontWeight: 600 }}>
              Yes: {formatVotes(yesVotes)} ({pctOfSupply(yesVotes, publicSupply)}% of public supply)
            </span>
            <span style={{ fontSize: "12px", color: "var(--rose)", fontWeight: 600 }}>
              No: {formatVotes(noVotes)} ({pctOfSupply(noVotes, publicSupply)}% of public supply)
            </span>
          </div>
          <div style={{ position: "relative", height: "6px", borderRadius: "999px", background: "rgba(255,255,255,0.06)", overflow: "hidden", display: "flex" }}>
            <div style={{ height: "100%", width: `${barWidthPct(yesVotes, publicSupply)}%`, background: "linear-gradient(90deg, var(--emerald), var(--teal))", transition: "width 0.8s" }} />
            <div style={{ height: "100%", width: `${barWidthPct(noVotes, publicSupply)}%`, background: "var(--rose)", transition: "width 0.8s" }} />
          </div>
          <div style={{ position: "relative", height: "26px" }}>
            <div style={{ position: "absolute", left: "20%", top: 0, height: "8px", width: "2px", background: "var(--amber)" }} />
            <span style={{ position: "absolute", left: "20%", top: "9px", transform: "translateX(-50%)", fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Quorum 20%</span>
            <div style={{ position: "absolute", left: "50%", top: 0, height: "8px", width: "2px", background: "var(--amber)" }} />
            <span style={{ position: "absolute", left: "50%", top: "9px", transform: "translateX(-50%)", fontSize: "10px", color: "var(--text-muted)", whiteSpace: "nowrap" }}>Fast track 50%</span>
          </div>
          <div style={{ fontSize: "12px", color: "var(--text-secondary)", display: "flex", flexDirection: "column", gap: "4px" }}>
            <span>Turnout: {pctOfSupply(totalVotes, publicSupply)}% (quorum needs 20%)</span>
            {milestone.isVotingOpen && !milestone.isExecuted && (
              <span>
                {fastTrackReached
                  ? "Fast track reached: execution is possible now"
                  : `Fast track: ${formatVotes(fastTrackNeeded)} more Yes needed (more than 50% of the public supply)`}
              </span>
            )}
            {hasVotes && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>Of votes cast: {yesPct}% Yes</span>
            )}
          </div>
        </div>
      ) : (
        <div style={{ marginBottom: "16px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
            <span style={{ fontSize: "12px", color: "var(--emerald)", fontWeight: 600 }}>Yes: {formatVotes(yesVotes)} ({yesPct}%)</span>
            <span style={{ fontSize: "12px", color: "var(--rose)", fontWeight: 600 }}>No: {formatVotes(noVotes)} ({noPct}%)</span>
          </div>
          <div style={{ height: "6px", borderRadius: "999px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
            <div style={{ height: "100%", width: `${yesPct}%`, background: "linear-gradient(90deg, var(--emerald), var(--teal))", transition: "width 0.8s" }} />
          </div>
        </div>
      )}

      {/* Voting Actions */}
      {milestone.isVotingOpen && !milestone.isExecuted && (
        <div>
          {!isConnected ? (
            <div className="alert alert-warning" style={{ fontSize: "13px" }}>
              <span>🔌</span> Connect wallet to vote
            </div>
          ) : voteStatus === "success" || relayConfirmed || hasVoted ? (
            <div className="alert alert-success" style={{ fontSize: "13px" }}>
              <span>✅</span> Vote submitted successfully!
            </div>
          ) : !canVote ? (
            <div className="alert alert-info" style={{ fontSize: "13px" }}>
              <span>ℹ️</span>{" "}
              {cancelled
                ? "This project is cancelled."
                : isDeveloperWallet
                ? "The developer wallet cannot vote."
                : "The voting period for this milestone has ended."}
            </div>
          ) : (
            <>
              <GaslessNotice />
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="btn-success"
                  style={{ flex: 1 }}
                  onClick={() => void handleGaslessVote(true)}
                  disabled={!user || relayActive || voteStatus === "pending" || isConfirming}
                >
                  {relayBusy && lastSupport ? "Preparing..." : "👍 Vote Yes (gasless)"}
                </button>
                <button
                  className="btn-danger"
                  style={{ flex: 1 }}
                  onClick={() => void handleGaslessVote(false)}
                  disabled={!user || relayActive || voteStatus === "pending" || isConfirming}
                >
                  {relayBusy && !lastSupport ? "Preparing..." : "👎 Vote No (gasless)"}
                </button>
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", margin: "12px 0 6px" }}>Pay gas yourself</div>
              <div style={{ display: "flex", gap: "10px" }}>
                <button
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => handleVote(true)}
                  disabled={relayActive || voteStatus === "pending" || isConfirming}
                >
                  {voting === "yes" && voteStatus === "pending" ? (
                    <><span className="spinner" style={{ width: "14px", height: "14px" }} /> Voting...</>
                  ) : "Vote Yes (pay gas)"}
                </button>
                <button
                  className="btn-secondary"
                  style={{ flex: 1 }}
                  onClick={() => handleVote(false)}
                  disabled={relayActive || voteStatus === "pending" || isConfirming}
                >
                  {voting === "no" && voteStatus === "pending" ? (
                    <><span className="spinner" style={{ width: "14px", height: "14px" }} /> Voting...</>
                  ) : "Vote No (pay gas)"}
                </button>
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
          {voteStatus === "error" && (
            <div className="alert alert-error" style={{ marginTop: "8px", fontSize: "13px" }}>
              <span>⚠️</span> {voteError}
            </div>
          )}
        </div>
      )}

      {milestone.isExecuted && (
        <div className="alert alert-success" style={{ fontSize: "13px" }}>
          <span>✅</span> Milestone executed — funds released to developer
        </div>
      )}

      {!milestone.isVotingOpen && !milestone.isExecuted && (
        <div className="alert alert-info" style={{ fontSize: "13px" }}>
          <span>⏳</span> Voting not yet open for this milestone
        </div>
      )}
    </div>
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

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Breadcrumb */}
      <div className="fade-in-up" style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>← Marketplace</Link>
        <span style={{ color: "var(--text-muted)", margin: "0 8px", fontSize: "14px" }}>/</span>
        <Link href={`/projects/${encodeURIComponent(id)}`} style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Project</Link>
        <span style={{ color: "var(--text-muted)", margin: "0 8px", fontSize: "14px" }}>/</span>
        <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>Milestones</span>
      </div>

      {/* Header */}
      <div className="fade-in-up" style={{ marginBottom: "40px" }}>
        <span className="section-tag">🗳️ Governance</span>
        <h1 style={{ fontSize: "32px", margin: "0 0 12px" }}>Milestone Voting</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.6 }}>
          Review milestone progress and vote to release or withhold funds. Your tokens represent your voting power.
        </p>
      </div>

      {/* Info Banner */}
      <div className="alert alert-info fade-in-up" style={{ marginBottom: "32px" }}>
        <span style={{ fontSize: "16px", flexShrink: 0 }}>ℹ️</span>
        <div style={{ fontSize: "13px" }}>
          <strong>How voting works:</strong> Once a milestone is open, token holders can vote Yes or No. If a milestone passes quorum, the developer receives the allocated funds. Failed milestones trigger a refund.
        </div>
      </div>

      {/* Milestones List */}
      {milestones.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px 24px" }}>
          <div style={{ fontSize: "48px", marginBottom: "16px" }}>🎯</div>
          <h3 style={{ fontSize: "18px", marginBottom: "8px", color: "var(--text-primary)" }}>No Milestones Found</h3>
          <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            Milestones are indexed by Ponder once the project is funded and closed.
          </p>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          {milestones.map((m, i) => (
            <MilestoneCard
              key={m.id}
              milestone={m}
              projectId={id}
              index={i}
              now={now}
              cancelled={cancelled}
              publicSupply={publicSupply}
              isDeveloperWallet={isDeveloperWallet}
              hasVoted={m.milestoneIndex === openIndex && chainHasVoted === true}
            />
          ))}
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
        <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
            {[1, 2, 3].map(i => (
              <div key={i} className="glass-card" style={{ padding: "24px", height: "160px", opacity: 0.5 }} />
            ))}
          </div>
        </div>
      }
    >
      <MilestonesContent id={id} />
    </Suspense>
  );
}
