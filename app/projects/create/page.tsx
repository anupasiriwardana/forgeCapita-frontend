"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useWriteContract, useAccount, useChainId, usePublicClient } from "wagmi";
import { parseEther, parseEventLogs } from "viem";
import { useRouter } from "next/navigation";
import { chainCurrency, chainName } from "@/config/chains";
import {
  ApiError,
  attachLaunchDraft,
  cancelLaunchDraft,
  createLaunchDraft,
  describeFounderError,
  fetchFounderMe,
  fetchLaunchEligibility,
  getProject,
  projectIdOf,
  shortAddr,
  type LaunchDraftDto,
  type LaunchEligibilityDto,
  type ShadowWalletDto,
} from "@/lib/api";
import { ABIS, getContractConfig } from "@/lib/contracts";
import { useAuth } from "@/components/web3/AuthProvider";
import { getFeeOverrides } from "@/lib/fees";

const ATTACH_MAX_ATTEMPTS = 4;
const ATTACH_RETRY_DELAY_MS = 3000;
const INDEX_POLL_ATTEMPTS = 10;
const INDEX_POLL_DELAY_MS = 3000;

function sleep(ms: number): Promise<void> {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

interface MilestoneRow {
  description: string;
  percentage: string;
}

export default function CreateProjectPage() {
  const router = useRouter();
  const { isConnected } = useAccount();
  const chainId = useChainId();
  const publicClient = usePublicClient();

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

  const [status, setStatus] = useState<"idle" | "drafting" | "submitting" | "waiting" | "attaching" | "indexing" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const { user, role, loading: authLoading, signIn } = useAuth();
  const [eligibility, setEligibility] = useState<LaunchEligibilityDto | null>(null);
  const [freeWallets, setFreeWallets] = useState<ShadowWalletDto[]>([]);
  const [shadowWalletId, setShadowWalletId] = useState("");
  const [gateError, setGateError] = useState("");
  const [slowIndexId, setSlowIndexId] = useState("");
  const isFounder = role === "founder";

  function freeWalletsOf(wallets: ShadowWalletDto[]): ShadowWalletDto[] {
    return wallets.filter((w) => w.status === "approved" && w.projectId === null && !w.reserved);
  }

  async function refreshWallets(): Promise<void> {
    if (!isFounder) return;
    try {
      const me = await fetchFounderMe();
      setFreeWallets(freeWalletsOf(me.wallets));
    } catch (err) {
      setGateError(describeFounderError(err, "Could not refresh shadow wallets"));
    }
  }

  useEffect(() => {
    if (!isFounder) return;
    const controller = new AbortController();
    const { signal } = controller;
    fetchLaunchEligibility(signal)
      .then(async (result) => {
        const me = result.eligible ? await fetchFounderMe(signal) : null;
        if (signal.aborted) return;
        setEligibility(result);
        setFreeWallets(me ? freeWalletsOf(me.wallets) : []);
        setGateError("");
      })
      .catch((err: unknown) => {
        if (!signal.aborted) setGateError(describeFounderError(err, "Could not check launch eligibility"));
      });
    return () => controller.abort();
  }, [isFounder]);

  const authPending = authLoading && !user;
  const roleAllowed = user !== null && (isFounder || role === "staff" || role === "admin");
  const roleBlocked = !authPending && !roleAllowed;
  const founderBlocked =
    authPending ||
    roleBlocked ||
    (isFounder && (!eligibility || !eligibility.eligible || shadowWalletId === "" || gateError !== ""));

  const { writeContractAsync } = useWriteContract();


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

  async function cancelDraftQuietly(draft: LaunchDraftDto): Promise<void> {
    try {
      await cancelLaunchDraft(draft.id);
    } catch {
      // Best effort: an unattached draft expires on its own after 2 hours.
    }
  }

  async function attachWithRetry(draftId: string, escrow: string): Promise<void> {
    for (let attempt = 1; ; attempt++) {
      try {
        await attachLaunchDraft(draftId, escrow);
        return;
      } catch (err) {
        const retryable = err instanceof ApiError && (err.status === 0 || err.status >= 500);
        if (!retryable || attempt >= ATTACH_MAX_ATTEMPTS) throw err;
        await sleep(ATTACH_RETRY_DELAY_MS);
      }
    }
  }

  async function waitForIndexing(projectId: string): Promise<boolean> {
    for (let attempt = 0; attempt < INDEX_POLL_ATTEMPTS; attempt++) {
      try {
        await getProject(projectId);
        return true;
      } catch (err) {
        const transient = err instanceof ApiError && (err.status === 404 || err.status === 0 || err.status >= 500);
        if (!transient) return false;
      }
      await sleep(INDEX_POLL_DELAY_MS);
    }
    return false;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy) return;
    if (!isConnected) { setErrorMsg("Please connect your wallet first."); return; }
    if (roleBlocked) { setErrorMsg("Only approved founders can launch projects."); return; }
    if (founderBlocked) { setErrorMsg("Complete the launch requirements and pick a shadow wallet first."); return; }
    if (totalPct !== 100) { setErrorMsg("Milestone percentages must sum to 100%."); return; }
    if (!name || !description || !fundingGoalEth) { setErrorMsg("Name, description, and funding goal are required."); return; }

    const factory = getContractConfig(chainId, "factory");
    if (!factory) { setErrorMsg("Unsupported network. Switch to Arbitrum Sepolia or BSC Testnet."); return; }
    if (!publicClient) { setErrorMsg("No RPC client available for this network."); return; }

    setStatus("drafting");
    setErrorMsg("");
    setSuccessMsg("");
    setSlowIndexId("");

    // Step 1: save the profile and reserve the shadow wallet before any transaction.
    let draft: LaunchDraftDto;
    try {
      draft = await createLaunchDraft({
        chainId,
        name,
        description,
        founderBio,
        logoUrl,
        websiteUrl,
        pitchDeckUrl,
        ...(isFounder ? { shadowWalletId } : {}),
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(describeFounderError(err, "Could not save the launch draft"));
      return;
    }

    // Step 2: on-chain transaction.
    setStatus("submitting");
    let hash: `0x${string}`;
    try {
      hash = await writeContractAsync({
        address: factory.address,
        abi: factory.abi,
        functionName: "launchProject",
        args: [
          name,
          symbol || name.slice(0, 4).toUpperCase(),
          BigInt(totalSupply),
          milestones.map((m) => m.description),
          milestones.map((m) => BigInt(m.percentage)),
          parseEther(fundingGoalEth),
          BigInt(fundingDays),
        ],
        ...(await getFeeOverrides(publicClient)),
      });
    } catch (err) {
      await cancelDraftQuietly(draft);
      await refreshWallets();
      setStatus("error");
      setErrorMsg(err instanceof Error ? err.message : "The transaction was not sent.");
      return;
    }

    setStatus("waiting");
    let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash });
    } catch {
      setStatus("error");
      setErrorMsg(
        `Transaction submitted: ${hash}. Check the explorer; if it succeeds the project appears shortly; if you reloaded, open /founder to see reserved wallets.`,
      );
      return;
    }
    if (receipt.status !== "success") {
      await cancelDraftQuietly(draft);
      await refreshWallets();
      setStatus("error");
      setErrorMsg("The transaction reverted on-chain. No project was created.");
      return;
    }

    const [launched] = parseEventLogs({
      abi: ABIS.factory,
      eventName: "ProjectLaunched",
      logs: receipt.logs,
    });
    if (!launched) {
      setStatus("error");
      setErrorMsg(`Transaction ${hash} succeeded but the project address could not be read. Please save the hash and contact support.`);
      return;
    }
    const escrow = launched.args.milestoneEscrow;
    const projectId = projectIdOf(chainId, escrow);

    // Step 3: link the draft to the new escrow; the API applies the profile automatically.
    setStatus("attaching");
    try {
      await attachWithRetry(draft.id, escrow);
    } catch (err) {
      setStatus("error");
      setErrorMsg(
        `Project ${projectId} is on-chain (tx ${hash}) but linking your saved profile failed: ${describeFounderError(err, "network error")}. Do not launch again; open the project page to add the profile.`,
      );
      return;
    }

    // Step 4: wait briefly for the indexer.
    setStatus("indexing");
    const indexed = await waitForIndexing(projectId);
    if (indexed) {
      setStatus("done");
      setSuccessMsg("Project launched! Redirecting to your project page...");
      setTimeout(() => router.push(`/projects/${encodeURIComponent(projectId)}`), 2500);
      return;
    }
    setSlowIndexId(projectId);
    setStatus("idle");
    await refreshWallets();
  }

  function launchAnother() {
    setSlowIndexId("");
    setShadowWalletId("");
    setStatus("idle");
    void refreshWallets();
  }

  const isLoading = status !== "idle" && status !== "done" && status !== "error";
  const isBusy = isLoading || status === "done";

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div className="fade-in-up" style={{ marginBottom: "40px" }}>
        <span className="section-tag">🚀 Founder Dashboard</span>
        <h1 style={{ fontSize: "36px", margin: "0 0 12px" }}>Launch Your Project</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "16px", lineHeight: 1.6 }}>
          Deploy a milestone-gated escrow on {chainName(chainId)} and register your startup metadata in one workflow.
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
          { step: 1, label: "Save Profile", done: ["submitting", "waiting", "attaching", "indexing", "done"].includes(status) || slowIndexId !== "" },
          { step: 2, label: "On-Chain Deploy", done: ["attaching", "indexing", "done"].includes(status) || slowIndexId !== "" },
          { step: 3, label: "Indexing", done: status === "done" },
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

      {slowIndexId && (
        <div className="alert alert-warning fade-in-up" style={{ marginBottom: "24px", display: "block" }}>
          <p style={{ margin: "0 0 8px" }}>
            Your project is on-chain and will appear shortly (the indexer is catching up). Your profile and shadow wallet are already saved and will be applied automatically.
          </p>
          <p style={{ margin: "0 0 12px" }}>
            Project id:{" "}
            <Link href={`/projects/${encodeURIComponent(slowIndexId)}`} style={{ color: "var(--brand-accent)" }}>
              {slowIndexId}
            </Link>
          </p>
          <div style={{ display: "flex", gap: "12px", flexWrap: "wrap" }}>
            <Link href="/launches" className="btn-primary" style={{ textDecoration: "none" }}>View my launches</Link>
            <button type="button" className="btn-secondary" onClick={launchAnother}>Launch another project</button>
          </div>
        </div>
      )}
      {roleBlocked && (
        <div className="glass-card fade-in-up" style={{ padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "12px" }}>Only approved founders can launch projects</h2>
          {!user && (
            <p style={{ marginBottom: "12px" }}>
              <button type="button" className="btn-secondary" onClick={() => void signIn()}>Sign in</button>
            </p>
          )}
          <Link href="/apply" style={{ color: "var(--brand-accent)" }}>Apply to become a founder</Link>
        </div>
      )}
      {isFounder && (
        <div className="glass-card fade-in-up" style={{ padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "12px" }}>Launch requirements</h2>
          {gateError && <div role="alert" className="alert alert-error">{gateError}</div>}
          {!gateError && !eligibility && <p style={{ color: "var(--text-secondary)" }}>Checking eligibility…</p>}
          {eligibility && !eligibility.eligible && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li>{eligibility.checks.applicationApproved ? "✓" : "✗"} Application approved{" "}
                {!eligibility.checks.applicationApproved && <Link href="/apply" style={{ color: "var(--brand-accent)" }}>(apply)</Link>}
              </li>
              <li>{eligibility.checks.agreementAccepted ? "✓" : "✗"} Agreement accepted{" "}
                {!eligibility.checks.agreementAccepted && <Link href="/founder" style={{ color: "var(--brand-accent)" }}>(sign it)</Link>}
              </li>
              <li>{eligibility.checks.shadowWalletAvailable ? "✓" : "✗"} Approved shadow wallet available{" "}
                {!eligibility.checks.shadowWalletAvailable && <Link href="/founder" style={{ color: "var(--brand-accent)" }}>(request one)</Link>}
              </li>
            </ul>
          )}
          {eligibility?.eligible && freeWallets.length === 0 && (
            <p style={{ color: "var(--text-secondary)" }}>
              No free approved wallet: request one on <Link href="/founder" style={{ color: "var(--brand-accent)" }}>/founder</Link>
            </p>
          )}
          {eligibility?.eligible && freeWallets.length > 0 && (
            <div>
              <label className="label" htmlFor="shadowWalletId">Shadow wallet *</label>
              <select
                id="shadowWalletId"
                className="input-field"
                value={shadowWalletId}
                onChange={(e) => setShadowWalletId(e.target.value)}
              >
                <option value="">Select a wallet</option>
                {freeWallets.map((w) => (
                  <option key={w.id} value={w.id}>{shortAddr(w.address)}</option>
                ))}
              </select>
            </div>
          )}
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
              <label className="label">Funding Goal ({chainCurrency(chainId)}) *</label>
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
          disabled={isBusy || !isConnected || founderBlocked}
        >
          {isLoading ? (
            <>
              <span className="spinner" />
              {status === "drafting" && "Saving Profile..."}
              {status === "submitting" && "Confirm in Wallet..."}
              {status === "waiting" && "Waiting for Confirmation..."}
              {status === "attaching" && "Linking Profile..."}
              {status === "indexing" && "Waiting for Indexer..."}
            </>
          ) : (
            "🚀 Deploy & Launch Project"
          )}
        </button>
      </form>
    </div>
  );
}
