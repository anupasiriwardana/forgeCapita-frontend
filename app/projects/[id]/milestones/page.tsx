"use client";

import { useState, Suspense } from "react";
import { useParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { fetchMilestonesByProject, type Milestone } from "@/lib/api";
import MilestoneEscrowABI from "@/config/abis/MilestoneEscrow.json";
import Link from "next/link";

function MilestoneCard({
  milestone,
  projectId,
  index,
}: {
  milestone: Milestone;
  projectId: string;
  index: number;
}) {
  const { isConnected } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const [voting, setVoting] = useState<"yes" | "no" | null>(null);
  const [voteStatus, setVoteStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [voteError, setVoteError] = useState("");

  const { isLoading: isConfirming } = useWaitForTransactionReceipt({ hash: txHash });

  const yesVotes = Number(milestone.yesVotes);
  const noVotes = Number(milestone.noVotes);
  const totalVotes = yesVotes + noVotes;
  const yesPct = totalVotes > 0 ? Math.round((yesVotes / totalVotes) * 100) : 0;
  const noPct = totalVotes > 0 ? 100 - yesPct : 0;

  async function handleVote(support: boolean) {
    if (!isConnected) return;
    setVoting(support ? "yes" : "no");
    setVoteStatus("pending");
    setVoteError("");
    try {
      const hash = await writeContractAsync({
        address: projectId as `0x${string}`,
        abi: MilestoneEscrowABI.abi,
        functionName: "vote",
        args: [support],
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
          </div>
        </div>
      </div>

      {/* Vote counts */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--emerald)", fontWeight: 600 }}>Yes: {yesVotes.toLocaleString()} ({yesPct}%)</span>
          <span style={{ fontSize: "12px", color: "var(--rose)", fontWeight: 600 }}>No: {noVotes.toLocaleString()} ({noPct}%)</span>
        </div>
        <div style={{ height: "6px", borderRadius: "999px", background: "rgba(255,255,255,0.06)", overflow: "hidden" }}>
          <div style={{ height: "100%", width: `${yesPct}%`, background: "linear-gradient(90deg, var(--emerald), var(--teal))", transition: "width 0.8s" }} />
        </div>
      </div>

      {/* Voting Actions */}
      {milestone.isVotingOpen && !milestone.isExecuted && (
        <div>
          {!isConnected ? (
            <div className="alert alert-warning" style={{ fontSize: "13px" }}>
              <span>🔌</span> Connect wallet to vote
            </div>
          ) : voteStatus === "success" ? (
            <div className="alert alert-success" style={{ fontSize: "13px" }}>
              <span>✅</span> Vote submitted successfully!
            </div>
          ) : (
            <div style={{ display: "flex", gap: "10px" }}>
              <button
                className="btn-success"
                style={{ flex: 1 }}
                onClick={() => handleVote(true)}
                disabled={voteStatus === "pending" || isConfirming}
              >
                {voting === "yes" && voteStatus === "pending" ? (
                  <><span className="spinner" style={{ width: "14px", height: "14px" }} /> Voting...</>
                ) : "👍 Vote Yes"}
              </button>
              <button
                className="btn-danger"
                style={{ flex: 1 }}
                onClick={() => handleVote(false)}
                disabled={voteStatus === "pending" || isConfirming}
              >
                {voting === "no" && voteStatus === "pending" ? (
                  <><span className="spinner" style={{ width: "14px", height: "14px" }} /> Voting...</>
                ) : "👎 Vote No"}
              </button>
            </div>
          )}
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

function MilestonesContent({ id }: { id: string }) {
  const { data: milestones } = useSuspenseQuery({
    queryKey: ["milestones", id],
    queryFn: () => fetchMilestonesByProject(id),
  });

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Breadcrumb */}
      <div className="fade-in-up" style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>← Marketplace</Link>
        <span style={{ color: "var(--text-muted)", margin: "0 8px", fontSize: "14px" }}>/</span>
        <Link href={`/projects/${id}`} style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>Project</Link>
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
            <MilestoneCard key={m.id} milestone={m} projectId={id} index={i} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function MilestonesPage() {
  const params = useParams();
  const id = params.id as string;

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
