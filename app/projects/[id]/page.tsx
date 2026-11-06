"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useSendTransaction, useWaitForTransactionReceipt, useAccount, useChainId } from "wagmi";
import { parseEther } from "viem";
import { ApiError, getProject, formatEth, fundingProgress, shortAddr, type ProjectDto } from "@/lib/api";
import Link from "next/link";
import { Suspense } from "react";
import { chainName } from "@/config/chains";
import {
  displayState,
  fundingPhase,
  phaseInputOf as phaseOf,
  type FundingPhase,
  type FundingPhaseInput,
} from "@/lib/projectState";

const STATE_BADGE: Record<ProjectDto["state"], { label: string; className: string }> = {
  FUNDING: { label: "🟢 Funding", className: "badge-active" },
  ACTIVE: { label: "🟢 Active", className: "badge-active" },
  COMPLETED: { label: "✅ Completed", className: "badge-brand" },
  FAILED: { label: "⚫ Failed", className: "badge-inactive" },
  CANCELLED: { label: "⚫ Cancelled", className: "badge-inactive" },
  SHUTDOWN: { label: "⚫ Shut down", className: "badge-inactive" },
};

function formatDate(seconds: bigint): string {
  return new Date(Number(seconds) * 1000).toLocaleString();
}

function phaseLabel(phase: FundingPhase, input: FundingPhaseInput): string | null {
  switch (phase) {
    case "OPEN":
      return `Funding open until ${formatDate(input.fundingDeadline)}`;
    case "CLOSEABLE":
      return `Close window open until ${formatDate(input.fundingDeadline + input.closeGrace)}`;
    case "REFUNDABLE":
      return "Refund available";
    case "NOT_APPLICABLE":
      return null;
  }
}

function FundingPanel({ project }: { project: ProjectDto }) {
  const { isConnected, address } = useAccount();
  const walletChainId = useChainId();
  const wrongChain = walletChainId !== project.chainId;
  const [ethAmount, setEthAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "pending" | "success" | "error">("idle");
  const [txError, setTxError] = useState("");

  const { sendTransactionAsync } = useSendTransaction();
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  useWaitForTransactionReceipt({ hash: txHash });

  async function handleFund(e: React.FormEvent) {
    e.preventDefault();
    if (!ethAmount || Number(ethAmount) <= 0) return;
    if (wrongChain) return;
    setTxStatus("pending");
    setTxError("");
    try {
      const hash = await sendTransactionAsync({
        to: project.escrowAddress as `0x${string}`, // Sends ETH directly to trigger the receive() fallback
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
          {wrongChain && (
            <div className="alert alert-warning" style={{ marginBottom: "16px" }}>
              <span>⚠️</span>
              <span>Switch your wallet to this project&apos;s network (chain {project.chainId}) to fund it.</span>
            </div>
          )}
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
              disabled={txStatus === "pending" || !ethAmount || wrongChain}
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
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const { data: project } = useSuspenseQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      try {
        return await getProject(id);
      } catch (err) {
        if (err instanceof ApiError && err.status === 404) return null;
        throw err;
      }
    },
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

  const progress = fundingProgress(project.totalRaised, project.fundingGoal);
  const ethRaised = formatEth(project.totalRaised, 4);
  const ethGoal = formatEth(project.fundingGoal, 4);
  const profile = project.profile;
  const name = profile?.name ?? project.tokenName;
  const shownState = displayState(project);
  const phaseInput = phaseOf(project);
  const phase = fundingPhase(BigInt(nowSeconds), phaseInput);
  const phaseText = phaseLabel(phase, phaseInput);

  return (
    <div style={{ maxWidth: "1100px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Breadcrumb */}
      <div className="fade-in-up" style={{ marginBottom: "24px" }}>
        <Link href="/" style={{ color: "var(--text-muted)", textDecoration: "none", fontSize: "14px" }}>
          ← Marketplace
        </Link>
        <span style={{ color: "var(--text-muted)", margin: "0 8px", fontSize: "14px" }}>/</span>
        <span style={{ fontSize: "14px", color: "var(--text-secondary)" }}>{name || shortAddr(project.escrowAddress)}</span>
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
                {profile?.logoUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={profile.logoUrl} alt={name} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                ) : "🚀"}
              </div>
              <div>
                <h1 style={{ fontSize: "28px", margin: "0 0 8px" }}>{name || "Unnamed Project"}</h1>
                <div style={{ display: "flex", gap: "10px", flexWrap: "wrap", alignItems: "center" }}>
                  <span className={`badge ${STATE_BADGE[shownState].className}`}>
                    {STATE_BADGE[shownState].label}
                  </span>
                  {phaseText && (
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>{phaseText}</span>
                  )}
                  {profile?.websiteUrl && (
                    <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className="badge badge-brand" style={{ textDecoration: "none" }}>
                      🌐 Website
                    </a>
                  )}
                  {profile?.pitchDeckUrl && (
                    <a href={profile.pitchDeckUrl} target="_blank" rel="noopener noreferrer" className="badge badge-pending" style={{ textDecoration: "none" }}>
                      📄 Pitch Deck
                    </a>
                  )}
                </div>
              </div>
            </div>

            {profile?.description && (
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, marginBottom: "24px", fontSize: "15px" }}>
                {profile.description}
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
          {profile?.founderBio && (
            <div className="glass-card fade-in-up fade-in-up-1" style={{ padding: "24px", marginBottom: "24px" }}>
              <h2 style={{ fontSize: "16px", marginBottom: "12px", display: "flex", gap: "8px" }}>
                👤 About the Founder
              </h2>
              <p style={{ color: "var(--text-secondary)", lineHeight: 1.7, fontSize: "14px", margin: 0 }}>
                {profile.founderBio}
              </p>
            </div>
          )}

          {/* Contract Info */}
          <div className="glass-card fade-in-up fade-in-up-2" style={{ padding: "24px", marginBottom: "24px" }}>
            <h2 style={{ fontSize: "16px", marginBottom: "16px" }}>⛓️ Contract Details</h2>
            <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Escrow Address</span>
                <span style={{ fontSize: "12px", fontFamily: "monospace", color: "var(--text-secondary)" }}>{project.escrowAddress}</span>
              </div>
              <div style={{ display: "flex", justifyContent: "space-between", padding: "10px 12px", background: "rgba(255,255,255,0.02)", borderRadius: "8px" }}>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Network</span>
                <span style={{ fontSize: "12px", color: "var(--teal)", fontWeight: 600 }}>{chainName(project.chainId)}</span>
              </div>
            </div>
          </div>

          {/* Milestones Link */}
          <Link
            href={`/projects/${encodeURIComponent(id)}/milestones`}
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
          <FundingPanel project={project} />
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

function decodeRouteId(raw: string): string {
  try {
    return decodeURIComponent(raw);
  } catch {
    return raw;
  }
}

export default function ProjectDetailPage() {
  const params = useParams();
  const id = decodeRouteId(params.id as string);

  return (
    <Suspense fallback={<LoadingSkeleton />}>
      <ProjectDetailInner id={id} />
    </Suspense>
  );
}
