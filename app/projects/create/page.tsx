"use client";

import { useState } from "react";
import { useWriteContract, useWaitForTransactionReceipt, useAccount } from "wagmi";
import { parseEther } from "viem";
import { useRouter } from "next/navigation";
import { createStartupProfile } from "@/lib/api";
import FactoryABI from "@/config/abis/ForgeCapitaFactory.json";

const FACTORY_ADDRESS = process.env.NEXT_PUBLIC_FACTORY_ADDRESS as `0x${string}`;

interface MilestoneRow {
  description: string;
  percentage: string;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const { isConnected } = useAccount();

  // Form state
  const [name, setName] = useState("");
  const [symbol, setSymbol] = useState("");
  const [totalSupply, setTotalSupply] = useState("1000000");
  const [description, setDescription] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [pitchDeckUrl, setPitchDeckUrl] = useState("");
  const [founderBio, setFounderBio] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [fundingGoalEth, setFundingGoalEth] = useState("");
  const [fundingDays, setFundingDays] = useState("30");
  const [milestones, setMilestones] = useState<MilestoneRow[]>([
    { description: "MVP Development", percentage: "30" },
    { description: "Beta Launch", percentage: "40" },
    { description: "Growth Phase", percentage: "30" },
  ]);

  const [status, setStatus] = useState<"idle" | "submitting" | "waiting" | "saving" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  const { writeContractAsync } = useWriteContract();

  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  const { data: receipt } = useWaitForTransactionReceipt({ hash: txHash });

  const totalPct = milestones.reduce((s, m) => s + Number(m.percentage || 0), 0);

  function addMilestone() {
    setMilestones((prev) => [...prev, { description: "", percentage: "" }]);
  }

  function removeMilestone(i: number) {
    setMilestones((prev) => prev.filter((_, idx) => idx !== i));
  }

  function updateMilestone(i: number, field: keyof MilestoneRow, value: string) {
    setMilestones((prev) => prev.map((m, idx) => idx === i ? { ...m, [field]: value } : m));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!isConnected) { setErrorMsg("Please connect your wallet first."); return; }
    if (totalPct !== 100) { setErrorMsg("Milestone percentages must sum to 100%."); return; }
    if (!name || !description || !fundingGoalEth) { setErrorMsg("Name, description, and funding goal are required."); return; }

    setStatus("submitting");
    setErrorMsg("");
    setSuccessMsg("");

    try {
      // Step 1: on-chain transaction
      const hash = await writeContractAsync({
        address: FACTORY_ADDRESS,
        abi: FactoryABI.abi,
        functionName: "launchProject",
        args: [
          name,
          symbol || name.slice(0, 4).toUpperCase(),
          BigInt(totalSupply) * BigInt(10 ** 18),
          milestones.map((m) => m.description),
          milestones.map((m) => BigInt(m.percentage)),
          parseEther(fundingGoalEth),
          BigInt(fundingDays),
        ],
      });

      setTxHash(hash);
      setStatus("waiting");

      // Wait for receipt
      let escrowAddress: string | undefined;
      let retries = 0;
      while (!escrowAddress && retries < 60) {
        await new Promise((r) => setTimeout(r, 2000));
        retries++;
        if (receipt) {
          // First topic-less address in logs is the escrow
          const deployLog = receipt.logs.find(
            (log) => log.address.toLowerCase() !== FACTORY_ADDRESS.toLowerCase()
          );
          escrowAddress = deployLog?.address ?? receipt.logs[0]?.address;
        }
      }

      if (!escrowAddress) {
        setErrorMsg("Transaction succeeded but could not extract project address. Please save your tx hash and contact support.");
        setStatus("error");
        return;
      }

      // Step 2: off-chain metadata
      setStatus("saving");
      await createStartupProfile({
        projectId: escrowAddress,
        name,
        description,
        logoUrl: logoUrl || undefined,
        pitchDeckUrl: pitchDeckUrl || undefined,
        founderBio: founderBio || undefined,
        websiteUrl: websiteUrl || undefined,
      });

      setStatus("done");
      setSuccessMsg(`🎉 Project launched! Redirecting to your project page...`);
      setTimeout(() => router.push(`/projects/${escrowAddress}`), 2500);
    } catch (err) {
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "An unexpected error occurred.");
    }
  }

  const isLoading = status === "submitting" || status === "waiting" || status === "saving";

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div className="fade-in-up" style={{ marginBottom: "40px" }}>
        <span className="section-tag">🚀 Founder Dashboard</span>
        <h1 style={{ fontSize: "36px", margin: "0 0 12px" }}>Launch Your Project</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "16px", lineHeight: 1.6 }}>
          Deploy a milestone-gated escrow on Sepolia and register your startup metadata in one workflow.
        </p>
      </div>

      {/* Step indicators */}
      <div
        className="fade-in-up"
        style={{
          display: "flex",
          gap: "0",
          marginBottom: "40px",
          background: "rgba(255,255,255,0.03)",
          borderRadius: "12px",
          border: "1px solid var(--border)",
          overflow: "hidden",
        }}
      >
        {[
          { step: 1, label: "Off-Chain Metadata", done: status !== "idle" },
          { step: 2, label: "On-Chain Deploy", done: status === "waiting" || status === "saving" || status === "done" },
          { step: 3, label: "Profile Save", done: status === "done" },
        ].map(({ step, label, done }, i) => (
          <div
            key={step}
            style={{
              flex: 1,
              padding: "14px",
              display: "flex",
              alignItems: "center",
              gap: "8px",
              borderRight: i < 2 ? "1px solid var(--border)" : "none",
              background: done ? "rgba(99,102,241,0.08)" : "transparent",
              transition: "background 0.3s",
            }}
          >
            <div
              style={{
                width: "24px",
                height: "24px",
                borderRadius: "50%",
                background: done ? "linear-gradient(135deg, #6366f1, #8b5cf6)" : "rgba(255,255,255,0.08)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "11px",
                fontWeight: 700,
                flexShrink: 0,
                color: done ? "white" : "var(--text-muted)",
              }}
            >
              {done ? "✓" : step}
            </div>
            <span style={{ fontSize: "12px", fontWeight: 600, color: done ? "var(--brand-accent)" : "var(--text-muted)" }}>
              {label}
            </span>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div className="alert alert-error fade-in-up" style={{ marginBottom: "24px" }}>
          <span style={{ flexShrink: 0 }}>⚠️</span>
          <span>{errorMsg}</span>
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success fade-in-up" style={{ marginBottom: "24px" }}>
          <span style={{ flexShrink: 0 }}>✅</span>
          <span>{successMsg}</span>
        </div>
      )}
      {!isConnected && (
        <div className="alert alert-warning fade-in-up" style={{ marginBottom: "24px" }}>
          <span style={{ flexShrink: 0 }}>🔌</span>
          <span>Please connect your wallet to launch a project.</span>
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* ── Off-Chain Metadata ── */}
        <div className="glass-card fade-in-up" style={{ padding: "28px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>📝</span> Startup Profile
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label className="label">Project Name *</label>
              <input className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="CloudForge AI" required />
            </div>
            <div>
              <label className="label">Token Symbol</label>
              <input className="input-field" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="CGAI" maxLength={8} />
            </div>
          </div>
          <div style={{ marginTop: "16px" }}>
            <label className="label">Description *</label>
            <textarea className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does your startup build?" required style={{ minHeight: "90px" }} />
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px", marginTop: "16px" }}>
            <div>
              <label className="label">Logo URL</label>
              <input className="input-field" value={logoUrl} onChange={e => setLogoUrl(e.target.value)} placeholder="https://..." type="url" />
            </div>
            <div>
              <label className="label">Website URL</label>
              <input className="input-field" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://..." type="url" />
            </div>
          </div>
          <div style={{ marginTop: "16px" }}>
            <label className="label">Pitch Deck URL</label>
            <input className="input-field" value={pitchDeckUrl} onChange={e => setPitchDeckUrl(e.target.value)} placeholder="https://..." type="url" />
          </div>
          <div style={{ marginTop: "16px" }}>
            <label className="label">Founder Bio</label>
            <textarea className="input-field" value={founderBio} onChange={e => setFounderBio(e.target.value)} placeholder="Your background and experience..." style={{ minHeight: "70px" }} />
          </div>
        </div>

        {/* ── On-Chain Parameters ── */}
        <div className="glass-card fade-in-up fade-in-up-1" style={{ padding: "28px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "20px", display: "flex", alignItems: "center", gap: "8px" }}>
            <span style={{ fontSize: "20px" }}>⛓️</span> On-Chain Parameters
          </h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div>
              <label className="label">Funding Goal (ETH) *</label>
              <input className="input-field" value={fundingGoalEth} onChange={e => setFundingGoalEth(e.target.value)} placeholder="10" type="number" step="0.001" min="0.001" required />
            </div>
            <div>
              <label className="label">Funding Duration (days)</label>
              <input className="input-field" value={fundingDays} onChange={e => setFundingDays(e.target.value)} placeholder="30" type="number" min="1" max="365" />
            </div>
            <div>
              <label className="label">Total Token Supply</label>
              <input className="input-field" value={totalSupply} onChange={e => setTotalSupply(e.target.value)} placeholder="1000000" type="number" min="1" />
            </div>
          </div>
        </div>

        {/* ── Milestones ── */}
        <div className="glass-card fade-in-up fade-in-up-2" style={{ padding: "28px", marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "20px" }}>
            <h2 style={{ fontSize: "18px", margin: 0, display: "flex", alignItems: "center", gap: "8px" }}>
              <span style={{ fontSize: "20px" }}>🎯</span> Milestones
            </h2>
            <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
              <span
                style={{
                  fontSize: "13px",
                  fontWeight: 700,
                  color: totalPct === 100 ? "var(--emerald)" : totalPct > 100 ? "var(--rose)" : "var(--amber)",
                }}
              >
                {totalPct}% / 100%
              </span>
              <button type="button" className="btn-secondary" onClick={addMilestone} style={{ padding: "6px 12px", fontSize: "12px" }}>
                + Add
              </button>
            </div>
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
            {milestones.map((m, i) => (
              <div key={i} style={{ display: "flex", gap: "12px", alignItems: "flex-start" }}>
                <div
                  style={{
                    width: "28px",
                    height: "28px",
                    borderRadius: "50%",
                    background: "linear-gradient(135deg, rgba(99,102,241,0.3), rgba(139,92,246,0.3))",
                    border: "1px solid rgba(99,102,241,0.4)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "12px",
                    fontWeight: 700,
                    flexShrink: 0,
                    marginTop: "10px",
                    color: "var(--brand-accent)",
                  }}
                >
                  {i + 1}
                </div>
                <input
                  className="input-field"
                  style={{ flex: 1 }}
                  value={m.description}
                  onChange={e => updateMilestone(i, "description", e.target.value)}
                  placeholder={`Milestone ${i + 1} description`}
                />
                <div style={{ position: "relative", width: "90px", flexShrink: 0 }}>
                  <input
                    className="input-field"
                    style={{ paddingRight: "24px", textAlign: "right" }}
                    value={m.percentage}
                    onChange={e => updateMilestone(i, "percentage", e.target.value)}
                    placeholder="0"
                    type="number"
                    min="1"
                    max="100"
                  />
                  <span style={{ position: "absolute", right: "10px", top: "50%", transform: "translateY(-50%)", color: "var(--text-muted)", fontSize: "13px", pointerEvents: "none" }}>%</span>
                </div>
                {milestones.length > 1 && (
                  <button
                    type="button"
                    onClick={() => removeMilestone(i)}
                    style={{
                      width: "36px",
                      height: "44px",
                      borderRadius: "8px",
                      border: "1px solid rgba(244,63,94,0.3)",
                      background: "rgba(244,63,94,0.08)",
                      color: "var(--rose)",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                      fontSize: "16px",
                    }}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="btn-primary"
          style={{ width: "100%", padding: "16px", fontSize: "16px" }}
          disabled={isLoading || !isConnected}
        >
          {isLoading ? (
            <>
              <span className="spinner" />
              {status === "submitting" && "Submitting Transaction..."}
              {status === "waiting" && "Waiting for Confirmation..."}
              {status === "saving" && "Saving Profile..."}
            </>
          ) : (
            "🚀 Deploy & Launch Project"
          )}
        </button>
      </form>
    </div>
  );
}
