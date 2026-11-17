"use client";

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import Link from "next/link";
import { X } from "lucide-react";
import { StatusIcon } from "@/components/ui/StatusIcon";
import { useWriteContract, useAccount, useChainId, usePublicClient } from "wagmi";
import { parseEther, parseEventLogs } from "viem";
import { useRouter } from "next/navigation";
import { chainCurrency } from "@/config/chains";
import {
  ApiError,
  attachLaunchDraft,
  cancelLaunchDraft,
  createLaunchDraft,
  describeFounderError,
  fetchFounderMe,
  formatEthCeil,
  fetchLaunchEligibility,
  fetchOwnRepos,
  shortAddr,
  type LaunchDraftDto,
  type LaunchEligibilityDto,
  type OwnRepoDto,
  type ShadowWalletDto,
} from "@/lib/api";
import { ABIS, getContractConfig } from "@/lib/contracts";
import { useAuth } from "@/components/web3/AuthProvider";
import { getFeeOverrides } from "@/lib/fees";
import { explorerTxUrl } from "@/lib/explorer";
import { InfoDialog, ShadowWalletInfo } from "@/components/InfoDialog";
import { useMinimumGoal } from "@/lib/useMinimumGoal";
import { MinimumGoalPanel, liveMinimumWei } from "@/components/MinimumGoalPanel";

const ATTACH_MAX_ATTEMPTS = 4;
const ATTACH_RETRY_DELAY_MS = 3000;
const SUCCESS_REDIRECT_MS = 4000;
const DAY_MS = 86_400_000;
const DEFAULT_SUPPLY = "1000000";
const DEFAULT_DAYS = "30";
const DEFAULT_MILESTONES: MilestoneRow[] = [
  { description: "MVP Development", percentage: "30" },
  { description: "Beta Launch", percentage: "40" },
  { description: "Growth Phase", percentage: "30" },
];

const helperStyle = { fontSize: "12px", color: "var(--text-secondary)", margin: "6px 0 0", lineHeight: 1.5 } as const;
const linkStyle = { color: "var(--brand-accent)" } as const;
const requirementStyle = { display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" } as const;

function subscribeNever(): () => void {
  return () => undefined;
}

/** Funding end date for a whole number of days (1-365), or null when the input is not valid. */
function fundingEndLabel(nowMs: number, daysText: string): string | null {
  const days = Number(daysText);
  if (daysText.trim() === "" || !Number.isInteger(days) || days < 1 || days > 365) return null;
  return new Date(nowMs + days * DAY_MS).toLocaleDateString(undefined, { dateStyle: "long" });
}

function parseGoalWei(eth: string): bigint | null {
  if (eth === "") return null;
  try {
    return parseEther(eth);
  } catch {
    return null;
  }
}

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
  const [totalSupply, setTotalSupply] = useState(DEFAULT_SUPPLY);
  const [description, setDescription] = useState("");
  const [pitchDeckUrl, setPitchDeckUrl] = useState("");
  const [websiteUrl, setWebsiteUrl] = useState("");
  const [fundingGoalEth, setFundingGoalEth] = useState("");
  const [fundingDays, setFundingDays] = useState(DEFAULT_DAYS);
  const [milestones, setMilestones] = useState<MilestoneRow[]>(DEFAULT_MILESTONES);

  const [status, setStatus] = useState<"idle" | "drafting" | "submitting" | "waiting" | "attaching" | "done" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState("");
  const [launchedOpen, setLaunchedOpen] = useState(false);
  const [secondsLeft, setSecondsLeft] = useState(SUCCESS_REDIRECT_MS / 1000);
  const [receiptUrl, setReceiptUrl] = useState<string | null>(null);
  const redirectedRef = useRef(false);
  const mounted = useSyncExternalStore(subscribeNever, () => true, () => false);
  const [nowMs] = useState(() => Date.now());
  const { user, role, loading: authLoading, signIn } = useAuth();
  const [eligibility, setEligibility] = useState<LaunchEligibilityDto | null>(null);
  const [freeWallets, setFreeWallets] = useState<ShadowWalletDto[]>([]);
  const [shadowWalletId, setShadowWalletId] = useState("");
  const [selectableRepos, setSelectableRepos] = useState<OwnRepoDto[]>([]);
  const [repoId, setRepoId] = useState("");
  const [gateError, setGateError] = useState("");
  const isFounder = role === "founder";

  function freeWalletsOf(wallets: ShadowWalletDto[]): ShadowWalletDto[] {
    return wallets.filter((w) => w.status === "approved" && w.projectId === null && !w.reserved);
  }

  function selectableReposOf(repos: OwnRepoDto[]): OwnRepoDto[] {
    return repos.filter((r) => (r.status === "invited" || r.status === "active") && r.projectId === null && !r.reserved);
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
        const [me, repos] = result.eligible
          ? await Promise.all([fetchFounderMe(signal), fetchOwnRepos(signal)])
          : [null, []];
        if (signal.aborted) return;
        const selectable = selectableReposOf(repos);
        setEligibility(result);
        setFreeWallets(me ? freeWalletsOf(me.wallets) : []);
        setSelectableRepos(selectable);
        setRepoId(selectable.length === 1 ? (selectable[0]?.id ?? "") : "");
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
    (isFounder && (!eligibility || !eligibility.eligible || shadowWalletId === "" || repoId === "" || gateError !== ""));

  const { writeContractAsync } = useWriteContract();

  const goToLaunches = useCallback((): void => {
    if (redirectedRef.current) return;
    redirectedRef.current = true;
    router.push("/launches");
  }, [router]);

  useEffect(() => {
    if (!launchedOpen) return;
    const redirectTimer = setTimeout(goToLaunches, SUCCESS_REDIRECT_MS);
    const countdown = setInterval(() => setSecondsLeft((s) => Math.max(0, s - 1)), 1000);
    return () => {
      clearTimeout(redirectTimer);
      clearInterval(countdown);
    };
  }, [launchedOpen, goToLaunches]);

  const minimumGoal = useMinimumGoal(chainId);
  const enteredGoalWei = parseGoalWei(fundingGoalEth);
  const liveMinWei = liveMinimumWei(minimumGoal.data);
  const belowMinimum = liveMinWei !== null && enteredGoalWei !== null && enteredGoalWei < liveMinWei;

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

  function resetForm(): void {
    setName("");
    setSymbol("");
    setTotalSupply(DEFAULT_SUPPLY);
    setDescription("");
    setPitchDeckUrl("");
    setWebsiteUrl("");
    setFundingGoalEth("");
    setFundingDays(DEFAULT_DAYS);
    setMilestones(DEFAULT_MILESTONES);
    setShadowWalletId("");
    setRepoId("");
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (isBusy) return;
    if (!isConnected) { setErrorMsg("Please connect your wallet first."); return; }
    if (roleBlocked) { setErrorMsg("Only approved founders can launch projects."); return; }
    if (founderBlocked) { setErrorMsg("Complete the launch requirements and choose a shadow wallet and repository first."); return; }
    if (totalPct !== 100) { setErrorMsg("Milestone percentages must add up to 100%."); return; }
    if (!name || !description || !fundingGoalEth) { setErrorMsg("Project name, description and fund goal are required."); return; }

    if (belowMinimum && liveMinWei !== null) {
      setErrorMsg(`Your fund goal is below the minimum of ${formatEthCeil(liveMinWei.toString(), 6)} ${chainCurrency(chainId)}.`);
      return;
    }

    const factory = getContractConfig(chainId, "factory");
    if (!factory) { setErrorMsg("This network is not supported. Switch to Arbitrum Sepolia or BSC Testnet in your wallet."); return; }
    if (!publicClient) { setErrorMsg("Could not connect to the network. Try again."); return; }

    setStatus("drafting");
    setErrorMsg("");

    // Step 1: save the project details and reserve the shadow wallet before asking for confirmation.
    let draft: LaunchDraftDto;
    try {
      draft = await createLaunchDraft({
        chainId,
        name,
        description,
        websiteUrl,
        pitchDeckUrl,
        ...(enteredGoalWei !== null ? { fundingGoalWei: enteredGoalWei.toString() } : {}),
        ...(isFounder ? { shadowWalletId, repoId } : {}),
      });
    } catch (err) {
      setStatus("error");
      setErrorMsg(describeFounderError(err, "Could not save your project details"));
      return;
    }

    // Step 2: the founder confirms in the wallet.
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
    } catch {
      await cancelDraftQuietly(draft);
      await refreshWallets();
      setStatus("error");
      setErrorMsg("The request was not confirmed in your wallet. Nothing was created.");
      return;
    }

    setStatus("waiting");
    let receipt: Awaited<ReturnType<typeof publicClient.waitForTransactionReceipt>>;
    try {
      receipt = await publicClient.waitForTransactionReceipt({ hash });
    } catch {
      setStatus("error");
      setErrorMsg(`Your confirmation was sent but is not finished yet. Check your launches in a minute. Reference: ${hash}`);
      return;
    }
    if (receipt.status !== "success") {
      await cancelDraftQuietly(draft);
      await refreshWallets();
      setStatus("error");
      setErrorMsg("The launch did not go through. No project was created.");
      return;
    }

    const [launched] = parseEventLogs({
      abi: ABIS.factory,
      eventName: "ProjectLaunched",
      logs: receipt.logs,
    });
    if (!launched) {
      setStatus("error");
      setErrorMsg(`Your project was created but we could not read it back. Keep this reference and contact support: ${hash}`);
      return;
    }
    const escrow = launched.args.milestoneEscrow;

    // Step 3: link the saved details to the new project; the API applies them automatically.
    setStatus("attaching");
    try {
      await attachWithRetry(draft.id, escrow);
    } catch {
      setStatus("error");
      setErrorMsg(
        "Your project was created but we could not link your saved details. Do not launch again. Open the project page to add them.",
      );
      return;
    }

    // The project exists once linking succeeds; the launches page does not wait for indexing.
    setStatus("done");
    setReceiptUrl(explorerTxUrl(chainId, hash));
    resetForm();
    setSecondsLeft(SUCCESS_REDIRECT_MS / 1000);
    setLaunchedOpen(true);
  }

  const isLoading = status !== "idle" && status !== "done" && status !== "error";
  const isBusy = isLoading || status === "done";
  const fundingEnd = mounted ? fundingEndLabel(nowMs, fundingDays) : null;
  const submitBlockReason = isBusy
    ? ""
    : !isConnected
      ? "Connect your wallet to launch."
      : founderBlocked
        ? "Complete the launch requirements above first."
        : belowMinimum
          ? "Your fund goal is below the minimum."
          : totalPct !== 100
            ? "Milestone percentages must add up to 100%."
            : "";

  const stepStates = [
    { step: 1, label: "Save details", done: ["submitting", "waiting", "attaching", "done"].includes(status) },
    { step: 2, label: "Confirm in wallet", done: ["attaching", "done"].includes(status) },
    { step: 3, label: "Create project", done: status === "done" },
  ];

  return (
    <div style={{ maxWidth: "760px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Header */}
      <div className="fade-in-up" style={{ marginBottom: "40px" }}>
        <span className="section-tag">Founder tools</span>
        <h1 style={{ fontSize: "36px", margin: "0 0 12px" }}>Launch Your Project</h1>
        <p style={{ color: "var(--text-secondary)", fontSize: "16px", lineHeight: 1.6 }}>
          Set your fund goal and milestones. Investors fund your project, and you unlock the money milestone by milestone.
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
        {stepStates.map(({ step, label, done }, i) => (
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
              {step}
            </div>
            <div style={{ display: "flex", flexDirection: "column" }}>
              <span style={{ fontSize: "12px", fontWeight: 600, color: done ? "var(--brand-accent)" : "var(--text-muted)" }}>
                {label}
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "4px", fontSize: "11px", color: "var(--text-muted)" }}>
                <StatusIcon state={done ? "done" : "todo"} label={done ? "Done" : "Not done"} size={14} />
              </span>
            </div>
          </div>
        ))}
      </div>

      {/* Alerts */}
      {errorMsg && (
        <div role="alert" className="alert alert-error fade-in-up" style={{ marginBottom: "24px" }}>
          <span>{errorMsg}</span>
        </div>
      )}
      {!isConnected && (
        <div className="alert alert-warning fade-in-up" style={{ marginBottom: "24px" }}>
          <span>Please connect your wallet to launch a project.</span>
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
          <Link href="/apply" style={linkStyle}>Apply to become a founder</Link>
        </div>
      )}
      {isFounder && (
        <div className="glass-card fade-in-up" style={{ padding: "24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "12px" }}>Launch requirements</h2>
          {gateError && <div role="alert" className="alert alert-error">{gateError}</div>}
          {!gateError && !eligibility && <p style={{ color: "var(--text-secondary)" }}>Checking your launch requirements...</p>}
          {eligibility && !eligibility.eligible && (
            <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
              <li style={requirementStyle}>
                <StatusIcon state={eligibility.checks.applicationApproved ? "done" : "todo"} label={eligibility.checks.applicationApproved ? "Done" : "Not done"} />
                <span>Application approved</span>
                {!eligibility.checks.applicationApproved && <Link href="/apply" style={linkStyle}>Apply</Link>}
              </li>
              <li style={requirementStyle}>
                <StatusIcon state={eligibility.checks.agreementAccepted ? "done" : "todo"} label={eligibility.checks.agreementAccepted ? "Done" : "Not done"} />
                <span>Agreement accepted</span>
                {!eligibility.checks.agreementAccepted && <Link href="/founder" style={linkStyle}>Sign it</Link>}
              </li>
              <li style={requirementStyle}>
                <StatusIcon state={eligibility.checks.shadowWalletAvailable ? "done" : "todo"} label={eligibility.checks.shadowWalletAvailable ? "Done" : "Not done"} />
                <span>Approved shadow wallet</span>
                <ShadowWalletInfo />
                {!eligibility.checks.shadowWalletAvailable && <Link href="/founder" style={linkStyle}>Request one</Link>}
              </li>
              <li style={requirementStyle}>
                <StatusIcon state={eligibility.checks.repoProvisioned ? "done" : "todo"} label={eligibility.checks.repoProvisioned ? "Done" : "Not done"} />
                <span>Project code repository</span>
                {!eligibility.checks.repoProvisioned && <Link href="/founder#repo" style={linkStyle}>Request it</Link>}
              </li>
            </ul>
          )}
          {eligibility?.eligible && freeWallets.length === 0 && (
            <p style={{ color: "var(--text-secondary)" }}>
              You have no free shadow wallet. Request one on your <Link href="/founder" style={linkStyle}>founder page</Link>.
            </p>
          )}
          {eligibility?.eligible && freeWallets.length > 0 && (
            <div>
              <div style={{ display: "flex", alignItems: "center" }}>
                <label className="label" htmlFor="shadowWalletId">Shadow wallet *</label>
                <ShadowWalletInfo />
              </div>
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
              <p style={helperStyle}>Your project&apos;s revenue wallet. Each shadow wallet belongs to one project.</p>
            </div>
          )}
          {eligibility?.eligible && selectableRepos.length === 0 && (
            <p style={{ color: "var(--text-secondary)", marginTop: "12px" }}>
              You need a project code repository first. Request one on your <Link href="/founder#repo" style={linkStyle}>founder page</Link>.
            </p>
          )}
          {eligibility?.eligible && selectableRepos.length === 1 && selectableRepos[0] && (
            <div style={{ marginTop: "12px" }}>
              <span className="label">Project code repository *</span>
              <label style={{ display: "flex", gap: "8px", alignItems: "center", fontSize: "14px" }}>
                <input type="radio" name="repoId" checked={repoId === selectableRepos[0].id} onChange={() => setRepoId(selectableRepos[0]?.id ?? "")} />
                {selectableRepos[0].fullName}
              </label>
            </div>
          )}
          {eligibility?.eligible && selectableRepos.length > 1 && (
            <div style={{ marginTop: "12px" }}>
              <label className="label" htmlFor="repoId">Project code repository *</label>
              <select id="repoId" className="input-field" value={repoId} onChange={(e) => setRepoId(e.target.value)}>
                <option value="">Select a repository</option>
                {selectableRepos.map((r) => (
                  <option key={r.id} value={r.id}>{r.fullName}</option>
                ))}
              </select>
            </div>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        {/* Project details */}
        <div className="glass-card fade-in-up" style={{ padding: "28px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "6px" }}>Project details</h2>
          <p style={{ ...helperStyle, margin: "0 0 20px" }}>This is what investors see on your project page.</p>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
            <div>
              <label className="label" htmlFor="projectName">Project name *</label>
              <input id="projectName" className="input-field" value={name} onChange={e => setName(e.target.value)} placeholder="CloudForge AI" required />
            </div>
            <div>
              <label className="label" htmlFor="shareSymbol">Share symbol (optional)</label>
              <input id="shareSymbol" className="input-field" value={symbol} onChange={e => setSymbol(e.target.value.toUpperCase())} placeholder="CGAI" maxLength={8} />
              <p style={helperStyle}>A short code for your shares. We make one from your name if you leave it empty.</p>
            </div>
          </div>
          <div style={{ marginTop: "16px" }}>
            <label className="label" htmlFor="projectDescription">Description *</label>
            <textarea id="projectDescription" className="input-field" value={description} onChange={e => setDescription(e.target.value)} placeholder="What does your startup build?" required style={{ minHeight: "90px" }} />
            <p style={helperStyle}>Explain what you are building and who it is for.</p>
          </div>
          <div style={{ marginTop: "16px" }}>
            <label className="label" htmlFor="websiteLink">Website link (optional)</label>
            <input id="websiteLink" className="input-field" value={websiteUrl} onChange={e => setWebsiteUrl(e.target.value)} placeholder="https://..." type="url" />
          </div>
          <div style={{ marginTop: "16px" }}>
            <label className="label" htmlFor="pitchDeckLink">Pitch deck link (optional)</label>
            <input id="pitchDeckLink" className="input-field" value={pitchDeckUrl} onChange={e => setPitchDeckUrl(e.target.value)} placeholder="https://..." type="url" />
            <p style={helperStyle}>Investors see this on your project page.</p>
          </div>
        </div>

        {/* Fund goal settings */}
        <div className="glass-card fade-in-up fade-in-up-1" style={{ padding: "28px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "18px", marginBottom: "20px" }}>Fund goal settings</h2>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: "16px" }}>
            <div>
              <label className="label" htmlFor="fundGoal">Fund goal ({chainCurrency(chainId)}) *</label>
              <input id="fundGoal" className="input-field" value={fundingGoalEth} onChange={e => setFundingGoalEth(e.target.value)} placeholder="10" type="number" step="0.001" min="0.001" required />
              <p style={helperStyle}>How much you want to raise. ForgeCapita keeps 5% of the funds raised when funding closes.</p>
            </div>
            <div>
              <label className="label" htmlFor="fundingPeriod">Funding period (days)</label>
              <input id="fundingPeriod" className="input-field" value={fundingDays} onChange={e => setFundingDays(e.target.value)} placeholder="30" type="number" min="1" max="365" />
              <p style={helperStyle}>{fundingEnd ? `Funding ends on ${fundingEnd}` : "Enter a whole number of days from 1 to 365."}</p>
            </div>
            <div>
              <label className="label" htmlFor="shareCount">Number of shares (tokens)</label>
              <input id="shareCount" className="input-field" value={totalSupply} onChange={e => setTotalSupply(e.target.value)} placeholder="1000000" type="number" min="1" />
              <p style={helperStyle}>Investors receive a share of your project; this sets how many exist.</p>
            </div>
          </div>
          <MinimumGoalPanel chainId={chainId} goal={minimumGoal.data} enteredWei={enteredGoalWei} />
        </div>

        {/* Milestones */}
        <div className="glass-card fade-in-up fade-in-up-2" style={{ padding: "28px", marginBottom: "32px" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "8px" }}>
            <h2 style={{ fontSize: "18px", margin: 0 }}>Milestones</h2>
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
                + Add milestone
              </button>
            </div>
          </div>
          <p style={{ ...helperStyle, margin: "0 0 20px" }}>
            Funds are released as each milestone is approved by investors. Percentages must total 100%.
          </p>

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
                  id={`milestoneDescription${i}`}
                  aria-label={`Milestone ${i + 1} description`}
                  className="input-field"
                  style={{ flex: 1 }}
                  value={m.description}
                  onChange={e => updateMilestone(i, "description", e.target.value)}
                  placeholder={`Milestone ${i + 1} description`}
                />
                <div style={{ position: "relative", width: "90px", flexShrink: 0 }}>
                  <input
                    id={`milestonePercentage${i}`}
                    aria-label={`Milestone ${i + 1} percentage`}
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
                    aria-label={`Remove milestone ${i + 1}`}
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
                    <X size={16} aria-hidden="true" />
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* What happens next */}
        <div className="glass-card fade-in-up" style={{ padding: "20px 24px", marginBottom: "24px" }}>
          <h2 style={{ fontSize: "16px", marginBottom: "8px" }}>What happens when you click Launch</h2>
          <ol style={{ margin: 0, paddingLeft: "20px", fontSize: "14px", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <li>We save your project details.</li>
            <li>You confirm in your wallet.</li>
            <li>We create your project.</li>
          </ol>
        </div>

        {/* Submit */}
        <button
          type="submit"
          className="btn-primary"
          style={{ width: "100%", padding: "16px", fontSize: "16px" }}
          disabled={isBusy || !isConnected || founderBlocked || belowMinimum}
        >
          {isLoading ? (
            <>
              <span className="spinner" />
              {status === "drafting" && "Saving your details..."}
              {status === "submitting" && "Confirm in your wallet..."}
              {status === "waiting" && "Waiting for confirmation..."}
              {status === "attaching" && "Setting up your project..."}
            </>
          ) : (
            "Launch project"
          )}
        </button>
        {submitBlockReason && <p style={{ ...helperStyle, textAlign: "center", marginTop: "10px" }}>{submitBlockReason}</p>}
      </form>

      <InfoDialog
        open={launchedOpen}
        title="Project created"
        onClose={goToLaunches}
        closeLabel="Go to my launches now"
        actions={
          receiptUrl ? (
            <a href={receiptUrl} target="_blank" rel="noopener noreferrer" className="btn-secondary" style={{ textDecoration: "none" }}>
              View receipt
            </a>
          ) : null
        }
      >
        <p>Your project was created. Redirecting to My launches...</p>
        <p style={{ marginTop: "8px" }}>Redirecting in {secondsLeft} {secondsLeft === 1 ? "second" : "seconds"}.</p>
      </InfoDialog>
    </div>
  );
}
