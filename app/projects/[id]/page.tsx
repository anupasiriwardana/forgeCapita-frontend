"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther } from "viem";
import { fetchProjectById, formatEth, fundingProgress, shortAddr } from "@/lib/api";
import MilestoneEscrowABI from "@/config/abis/MilestoneEscrow.json";
import Link from "next/link";
import { Suspense } from "react";

function FundingPanel({ projectId }: { projectId: string }) {
  const { isConnected, address } = useAccount();
  const [ethAmount, setEthAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState("");

  const { writeContractAsync } = useWriteContract();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  useWaitForTransactionReceipt({ hash: txHash });

  async function handleFund(e: React.FormEvent) {
    e.preventDefault();
    if (!ethAmount || Number(ethAmount) <= 0) return;
    setTxStatus("pending");
    setTxError("");
    try {
      const hash = await writeContractAsync({
        address: projectId as `0x${string}`,
        abi: MilestoneEscrowABI.abi,
        functionName: "claimTokens",   // placeholder — actual deposit via sendTransaction
        args: [],
        value: parseEther(ethAmount),
      });
      setTxHash(hash);
      setTxStatus("success");
      setEthAmount("");
    } catch (err) {
      setTxStatus("error");
      setTxError(err instanceof Error ? err.message : "Transaction failed");
    }
  }

  return (
    <div className="glass-card" style={{ padding: "28px" }}>
      <h2 style={{ fontSize: "20px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
        💰 Fund This Project
      </h2>

      {!isConnected ? (
        <div className="alert alert-warning">
          <span>🔌</span>
          <span>Connect your wallet to fund this project.</span>
        </div>
      ) : (
        <form onSubmit={handleFund}>
          <label className="label">Amount (ETH)</label>
          <div style={{ display: "flex", gap: "12px", marginBottom: "16px" }}>
            <input
              className="input-field"
              type="number"
              step="0.001"
              min="0.001"
              value={ethAmount}
              onChange={e => setEthAmount(e.target.value)}
              placeholder="0.1"
              disabled={txStatus === "pending"}
            />
            <button
              type="submit"
              className="btn-primary"
              disabled={txStatus === "pending" || !ethAmount}
              style={{ flexShrink: 0, padding: "12px 20px" }}
            >
              {txStatus === "pending" ? <span className="spinner" style={{ width: "16px", height: "16px" }} /> : "Fund ⚡"}
            </button>
          </div>

          {/* Quick amounts */}
          <div style={{ display: "flex", gap: "8px", marginBottom: "16px" }}>
            {["0.01", "0.05", "0.1", "0.5"].map(amt => (
              <button
                key={amt}
                type="button"
                className="btn-secondary"
                style={{ padding: "6px 12px", fontSize: "12px" }}
                onClick={() => setEthAmount(amt)}
              >
                {amt} ETH
              </button>
            ))}
          </div>

          {txStatus === "success" && (
            <div className="alert alert-success">
              <span>✅</span>
              <span>Funding transaction submitted! Tokens will be claimable after funding closes.</span>
            </div>
          )}
          {txStatus === "error" && (
            <div className="alert alert-error">
              <span>⚠️</span>
              <span>{txError}</span>
            </div>
          )}
        </form>
      )}

      {address && (
        <div style={{ marginTop: "16px", paddingTop: "16px", borderTop: "1px solid var(--border)" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Connected as: </span>
          <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>{shortAddr(address)}</span>
        </div>
      )}
    </div>
  );
}

function ProjectDetailInner({ id }: { id: string }) {
  const { data: project } = useSuspenseQuery({
    queryKey: ["project", id],
    queryFn: () => fetchProjectById(id),
  });

  if (!project) {
    return (
      <div style={{ textAlign: "center", padding: "80px 24px" }}>
        <div style={{ fontSize: "56px", marginBottom: "16px" }}>🔍</div>
        <h2 style={{ fontSize: "22px", marginBottom: "8px" }}>Project Not Found</h2>
        <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
          This project does not exist in the on-chain registry yet.
        </p>
        <Link href="/" className="btn-secondary" style={{ display: "inline-flex" }}>
          ← Back to Marketplace
        </Link>
      </div>
    );
  }

  const progress = fundingProgress(project.total_raised, project.funding_goal);
  const ethRaised = formatEth(project.total_raised, 4);
  const ethGoal = formatEth(project.funding_goal, 4);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Breadcrumb */}
      <div className="fade-in-up" style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>
          ← Marketplace
        </Link>
        <span style={{ color: "var(--text-muted)", margin: "0 8px", fontSize: "14px" }}>/</span>
        <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>{project.name ?? shortAddr(project.id)}</span>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "32px", alignItems: "start" }}>
        {/* Left: Project Info */}
        <div>
          {/* Header */}
          <div className="glass-card fade-in-up" style={{ padding: "32px", marginBottom: "24px" }}>
            <div style={{ display: "flex", gap: "20px", alignItems: "flex-start", marginBottom: "24px" }}>
              <div
                style={{
                  width: "72px",
                  height: "72px",
                  borderRadius: "16px",
                  background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))",
                  border: "1px solid rgba(99,102,241,0.3)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "32px",
                  flexShrink: 0,
                  overflow: "hidden",
                }}
              >
                {project.logo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={project.logo_url} alt={project.name ?? ""} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : "🚀"}
              </div>
              <div>
                <h1 style={{ fontSize: "28px", margin: "0 0 8px" }}>{project.name ?? "Unnamed Project"}</h1>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <span className={`badge ${project.is_funding_active ? "badge-active" : "badge-inactive"}`}>
                    {project.is_funding_active ? "🟢 Live" : "⚫ Closed"}
                  </span>
                  {project.website_url && (
                    <a href={project.website_url} target="_blank" rel="noopener noreferrer" className="badge badge-brand" style={{ textDecoration: "none" }}>
                      🌐 Website
                    </a>
                  )}
                  {project.pitch_deck_url && (
                    <a href={project.pitch_deck_url} target="_blank" rel="noopener noreferrer" className="badge badge-pending" style={{ textDecoration: "none" }}>
                      📄 Pitch Deck
                    </a>
                  )}
                </div>
              </div>
            </div>

            {project.description && (
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "24px", fontSize: "15px" }}>
                {project.description}
              </p>
            )}

            {/* Funding Progress */}
            <div style={{ marginBottom: "8px", display: "flex", justifyContent: "space-between" }}>
              <span style={{ fontSize: "13px", color: "var(--text-muted)" }}>Funding Progress</span>
              <span style={{ fontSize: "13px", fontWeight: 700, color: "var(--brand-accent)" }}>{progress}%</span>
            </div>
            <div className="progress-bar" style={{ height: "8px", marginBottom: "16px" }}>
              <div className="progress-fill" style={{ width: `${progress}%` }} />
            </div>

            {/* Stats grid */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px" }}>
              <div className="stat-card">
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>RAISED</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--emerald)" }}>{ethRaised} ETH</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>GOAL</div>
                <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>{ethGoal} ETH</div>
              </div>
              <div className="stat-card">
                <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px" }}>DEVELOPER</div>
                <div style={{ fontSize: "14px", fontWeight: 700, color: "var(--text-primary)", fontFamily: "monospace" }}>{shortAddr(project.developer)}</div>
              </div>
            </div>
          </div>

          {/* Founder Bio */}
          {project.founder_bio && (
            <div className="glass-card fade-in-up fade-in-up-1" style={{ padding: "24px", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "16px", marginBottom: "12px", display: "flex", gap: "8px" }}>
                👤 About the Founder
              </h2>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "14px", margin: 0 }}>
                {project.founder_bio}
              </p>
            </div>
          )}

          {/* Contract Info */}
          <div className="glass-card fade-in-up fade-in-up-2" style={{ padding: "24px", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "16px", marginBottom: "16px" }}>⛓️ Contract Details</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Escrow Address</span>
                <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>{project.id}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Network</span>
                <span style={{ fontSize: "12px", color: "var(--teal)", fontWeight: 600 }}>Ethereum Sepolia</span>
              </div>
            </div>
          </div>

          {/* Milestones Link */}
          <Link
            href={`/projects/${id}/milestones`}
            className="glass-card fade-in-up fade-in-up-3"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "20px 24px",
              textDecoration: "none",
              border: "1px solid rgba(99,102,241,0.25)",
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span style={{ fontSize: "24px" }}>🗳️</span>
              <div>
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>Milestone Governance</div>
                <div style={{ fontSize: "13px", color: "var(--text-muted)" }}>Vote on milestones and release funds</div>
              </div>
            </div>
            <span style={{ color: "var(--brand-accent)", fontSize: "18px" }}>→</span>
          </Link>
        </div>

        {/* Right: Funding Panel */}
        <div style={{ position: "sticky", top: "88px" }}>
          <FundingPanel projectId={id} />
        </div>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 380px", gap: "32px" }}>
        <div className="glass-card" style={{ padding: "32px", height: "400px", opacity: 0.5 }} />
        <div className="glass-card" style={{ padding: "28px", height: "300px", opacity: 0.5 }} />
      </div>
    </div>
  );
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = params.id as string;

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ProjectDetailInner id={id} />
    </Suspense>
  );
}
