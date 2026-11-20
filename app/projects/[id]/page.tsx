"use client";

import { useState } from "react";
import { useParams } from "next/navigation";
import { useSuspenseQuery } from "@tanstack/react-query";
import { useSendTransaction, useWaitForTransactionReceipt, useAccount, useBalance, useChainId, useConfig, usePublicClient, useReadContracts } from "wagmi";
import { ABIS } from "@/lib/contracts";
import { useAuth } from "@/components/web3/AuthProvider";
import { useWriteAllowed } from "@/components/web3/useWriteAllowed";
import { ProfileRequiredNotice } from "@/components/ProfileRequiredNotice";
import { waitForTransactionReceipt } from "wagmi/actions";
import { parseEther } from "viem";
import { getFeeOverrides } from "@/lib/fees";
import { ApiError, getProject, formatEth, fundingProgress, type ProjectDto } from "@/lib/api";
import Link from "next/link";
import { ArrowLeft, ArrowRight, CalendarClock, CheckCircle2, Coins, ExternalLink, FileText, Flag, Globe, Link2, SearchX, Vote, XCircle, Zap } from "lucide-react";
import { ProjectLogo } from "@/components/ProjectLogo";
import { ProjectStatusBadge } from "@/components/ProjectStatusBadge";
import { Suspense } from "react";
import { chainCurrency, chainName } from "@/config/chains";
import { AddressChip } from "@/components/ui/AddressChip";
import { Amount } from "@/components/ui/Amount";
import { Button, ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Field, Input } from "@/components/ui/Field";
import { InlineAlert } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { StatusPill } from "@/components/ui/StatusPill";
import { Spinner } from "@/components/ui/Spinner";
import { toast } from "@/lib/toast";
import { toastTxError } from "@/lib/walletErrors";
import { explorerAddressUrl, explorerTxUrl } from "@/lib/explorer";
import { useMilestoneOutline, type MilestoneOutline } from "@/lib/useMilestoneOutline";
import { ReportProblem } from "@/components/ComplaintDialog";
import { InvestorPanel } from "@/components/InvestorPanel";
import { DeveloperPanel } from "@/components/DeveloperPanel";
import { CreatorFunds } from "@/components/CreatorFunds";
import { GuardianPanel } from "@/components/GuardianPanel";
import { MilestonePanel } from "@/components/MilestonePanel";
import { GasLedger } from "@/components/GasLedger";
import { TakeoverPanel } from "@/components/TakeoverPanel";
import { TransparencyPanel } from "@/components/TransparencyPanel";
import { ProfileEditor } from "@/components/ProfileEditor";
import {
  displayState,
  fundingPhase,
  phaseInputOf as phaseOf,
  type FundingPhase,
  type FundingPhaseInput,
} from "@/lib/projectState";

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

/** Unix seconds as YYYY-MM-DD in UTC; null for missing or invalid values. */
function utcDate(seconds: string): string | null {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

/** Inline validation for the funding amount (parsed as wei, no floating point); null when empty or valid. */
function fundAmountError(input: string): string | null {
  if (input.trim() === "") return null;
  try {
    return parseEther(input.trim()) > BigInt(0) ? null : "Enter an amount greater than 0.";
  } catch {
    return "Enter a valid amount.";
  }
}

function FundingClosedNote({ text }: { text: string }) {
  return (
    <Card>
      <CardBody style={{ display: "flex", alignItems: "center", gap: 10 }}>
        <Coins size={16} aria-hidden="true" style={{ color: "var(--text-2)", flexShrink: 0 }} />
        <p className="panel-note">{text}</p>
      </CardBody>
    </Card>
  );
}

type StepState = "done" | "current" | "failed" | "upcoming";

function milestoneStep(m: MilestoneOutline, project: ProjectDto): StepState {
  if (m.isExecuted) return "done";
  if (project.failedMilestoneIndex === m.index) return "failed";
  if (m.isVotingOpen) return "current";
  if (project.state === "ACTIVE" && project.currentMilestoneIndex === m.index) return "current";
  return "upcoming";
}

const STEP_LABEL: Record<StepState, string> = {
  done: "Released",
  current: "In progress",
  failed: "Failed",
  upcoming: "Upcoming",
};

function StepDot({ state, index }: { state: StepState; index: number }) {
  return (
    <span className="timeline-dot" aria-hidden="true">
      {state === "done" ? (
        <CheckCircle2 size={14} />
      ) : state === "failed" ? (
        <XCircle size={14} />
      ) : state === "current" ? (
        <Flag size={13} />
      ) : (
        <span className="num">{index + 1}</span>
      )}
    </span>
  );
}

function MilestoneTimeline({ project, milestones }: { project: ProjectDto; milestones: MilestoneOutline[] | null }) {
  const href = `/projects/${encodeURIComponent(project.id)}/milestones`;
  return (
    <Card>
      <CardHeader
        title="Milestones"
        subtitle="Funds are released one milestone at a time after a staked vote."
        actions={
          <ButtonLink href={href} variant="ghost" size="sm" rightIcon={<ArrowRight size={14} aria-hidden="true" />}>
            Voting
          </ButtonLink>
        }
      />
      <CardBody>
        {milestones === null ? (
          <div role="status" className="stack-md">
            <span className="sr-only">Loading milestones</span>
            {[1, 2, 3].map(n => (
              <div key={n} style={{ display: "flex", gap: 14 }}>
                <Skeleton width={28} height={28} radius="50%" />
                <div style={{ flex: 1 }}>
                  <Skeleton width="40%" height={14} style={{ marginBottom: 6 }} />
                  <Skeleton width="70%" height={12} />
                </div>
              </div>
            ))}
          </div>
        ) : milestones.length === 0 ? (
          <p className="panel-note">The milestone plan could not be read from the chain yet.</p>
        ) : (
          <ol className="timeline">
            {milestones.map(m => {
              const state = milestoneStep(m, project);
              return (
                <li key={m.index} className={`timeline-item is-${state}`}>
                  <StepDot state={state} index={m.index} />
                  <div className="timeline-body">
                    <div className="timeline-head">
                      <span className="timeline-title">Milestone {m.index + 1}</span>
                      <StatusPill tone={state === "done" ? "success" : state === "current" ? "warning" : state === "failed" ? "danger" : "neutral"}>
                        {STEP_LABEL[state]}
                      </StatusPill>
                    </div>
                    {m.description && <p className="timeline-desc">{m.description}</p>}
                    <p className="timeline-meta">
                      Releases <span className="num">{m.unlockPct.toString()}%</span> of net funds
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
        )}
      </CardBody>
    </Card>
  );
}

function MilestoneKpi({ project, milestones }: { project: ProjectDto; milestones: MilestoneOutline[] | null }) {
  if (milestones === null) return <StatCard label="Milestones" value="" loading icon={<Flag size={16} />} />;
  if (milestones.length === 0) return <StatCard label="Milestones" value="-" hint="Not readable yet" icon={<Flag size={16} />} />;
  const total = milestones.length;
  const released = milestones.filter(m => m.isExecuted).length;
  const open = milestones.find(m => m.isVotingOpen && !m.isExecuted);
  let hint = "Starts after funding closes";
  if (released === total) hint = "All milestones released";
  else if (open) hint = `Milestone ${open.index + 1} is in voting`;
  else if (project.state === "ACTIVE") hint = `Milestone ${project.currentMilestoneIndex + 1} not started`;
  else if (project.state !== "FUNDING") hint = "No milestone in progress";
  return <StatCard label="Milestones released" value={`${released} of ${total}`} hint={hint} icon={<Flag size={16} />} />;
}

function FundingPanel({ project, onFunded }: { project: ProjectDto; onFunded: () => void }) {
  const config = useConfig();
  const currency = chainCurrency(project.chainId);
  const { isConnected, address } = useAccount();
  const walletChainId = useChainId();
  const wrongChain = walletChainId !== project.chainId;
  const { allowed: writeAllowed } = useWriteAllowed();
  const [ethAmount, setEthAmount] = useState("");
  const [txStatus, setTxStatus] = useState<"idle" | "pending">("idle");

  const { sendTransactionAsync } = useSendTransaction();
  const feeClient = usePublicClient({ chainId: project.chainId });
  const [txHash, setTxHash] = useState<`0x${string}` | undefined>();
  useWaitForTransactionReceipt({ hash: txHash });

  const amountError = fundAmountError(ethAmount);
  const pending = txStatus === "pending";
  const pendingTxUrl = pending && txHash ? explorerTxUrl(project.chainId, txHash) : null;

  async function handleFund(e: React.FormEvent) {
    e.preventDefault();
    if (!ethAmount || Number(ethAmount) <= 0) return;
    if (wrongChain || !writeAllowed) return;
    setTxStatus("pending");
    setTxHash(undefined);
    try {
      const hash = await sendTransactionAsync({
        to: project.escrowAddress as `0x${string}`, // Sends native currency directly to trigger the receive() fallback
        value: parseEther(ethAmount),
        ...(await getFeeOverrides(feeClient)),
      });
      setTxHash(hash);
      const receipt = await waitForTransactionReceipt(config, { hash, chainId: project.chainId });
      if (receipt.status !== "success") {
        toast.error("Funding transaction reverted.");
        return;
      }
      toast.success("Funding confirmed", { description: "Tokens will be claimable after funding closes." });
      setEthAmount("");
      onFunded();
    } catch (err) {
      toastTxError(err);
    } finally {
      setTxStatus("idle");
    }
  }

  return (
    <Card>
      <CardHeader
        title={
          <span className="panel-title">
            <Coins size={16} aria-hidden="true" />
            Fund this project
          </span>
        }
        subtitle="Funds go to the project escrow and are released milestone by milestone."
      />
      <CardBody>
        {!isConnected ? (
          <InlineAlert tone="warning">Connect your wallet to fund this project.</InlineAlert>
        ) : (
          <form onSubmit={handleFund} className="stack-md" noValidate>
            <ProfileRequiredNotice />
            {wrongChain && (
              <InlineAlert tone="warning">
                Switch your wallet to this project&apos;s network ({chainName(project.chainId)}) to fund it.
              </InlineAlert>
            )}
            <Field label={`Amount (${currency})`} error={amountError ?? undefined}>
              <div className="input-row">
                <Input
                  type="number"
                  inputMode="decimal"
                  step="0.001"
                  min="0.001"
                  value={ethAmount}
                  onChange={e => setEthAmount(e.target.value)}
                  placeholder="0.1"
                  disabled={pending}
                  className="num"
                />
                <Button
                  type="submit"
                  loading={pending}
                  disabled={!ethAmount || amountError !== null || wrongChain || !writeAllowed}
                  rightIcon={<Zap size={16} aria-hidden="true" />}
                >
                  Fund
                </Button>
              </div>
            </Field>
            <div className="quick-amounts" style={{ marginTop: 0 }} role="group" aria-label="Quick amounts">
              {["0.01", "0.05", "0.1", "0.5"].map(amt => (
                <Button key={amt} variant="secondary" size="sm" onClick={() => setEthAmount(amt)} disabled={pending}>
                  <span className="num">{amt}</span> {currency}
                </Button>
              ))}
            </div>
            {pending && (
              <p className="tx-status" role="status" style={{ marginTop: 0 }}>
                <Spinner size={12} />
                {txHash ? "Waiting for confirmation" : "Confirm in your wallet"}
                {pendingTxUrl && (
                  <a href={pendingTxUrl} target="_blank" rel="noopener noreferrer">
                    View transaction
                  </a>
                )}
              </p>
            )}
          </form>
        )}

        {address && (
          <div className="panel-section" style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8 }}>
            <span className="panel-note">Connected as</span>
            <AddressChip address={address} />
          </div>
        )}
      </CardBody>
    </Card>
  );
}

function FundingGate({ project, nowSeconds, onFunded }: { project: ProjectDto; nowSeconds: number; onFunded: () => void }) {
  const { address } = useAccount();
  const { user } = useAuth();
  const escrow = project.escrowAddress as `0x${string}`;
  const { data } = useReadContracts({
    allowFailure: true,
    contracts: [
      { address: escrow, abi: ABIS.escrow, functionName: "isFundingActive", chainId: project.chainId },
      { address: escrow, abi: ABIS.escrow, functionName: "fundingDeadline", chainId: project.chainId },
    ],
  });

  const developer = project.developer.toLowerCase();
  if (developer === address?.toLowerCase() || developer === user?.address.toLowerCase()) return null;

  const chainActive = data?.[0]?.result;
  const chainDeadline = data?.[1]?.result;
  const indexerClosed = project.state !== "FUNDING" || project.fundingClosedAt != null;
  if (indexerClosed || chainActive === false) {
    return <FundingClosedNote text="Funding is closed for this project." />;
  }
  const deadline = typeof chainDeadline === "bigint" ? chainDeadline : BigInt(project.fundingDeadline);
  if (BigInt(nowSeconds) > deadline) {
    return <FundingClosedNote text="The funding window has ended." />;
  }
  return <FundingPanel project={project} onFunded={onFunded} />;
}

function ProjectDetailInner({ id }: { id: string }) {
  const [nowSeconds] = useState(() => Math.floor(Date.now() / 1000));
  const { data: project } = useSuspenseQuery({
    queryKey: ["project", id],
    queryFn: async () => {
      try {
        return await getProject(id);
      } catch (err) {
        // 400 means the id is malformed (e.g. a removed route like /projects/create): same page as a missing project.
        if (err instanceof ApiError && (err.status === 404 || err.status === 400)) return null;
        throw err;
      }
    },
  });

  const funding = project?.state === "FUNDING";
  const { data: liveBalance, refetch: refetchBalance } = useBalance({
    address: project ? (project.escrowAddress as `0x${string}`) : undefined,
    chainId: project?.chainId,
    query: { enabled: funding, refetchInterval: 10_000 },
  });
  const { milestones } = useMilestoneOutline(project?.chainId, project?.escrowAddress);

  if (!project) {
    return (
      <div className="page-container page-container-narrow">
        <h1 className="sr-only">Project not found</h1>
        <Card>
          <EmptyState
            icon={<SearchX size={20} />}
            title="Project not found"
            text="This project does not exist in the on-chain registry yet."
            action={
              <ButtonLink href="/projects" variant="secondary" leftIcon={<ArrowLeft size={16} aria-hidden="true" />}>
                Back to projects
              </ButtonLink>
            }
          />
        </Card>
      </div>
    );
  }

  // While funding is open the escrow balance equals the funds raised (the fee is taken at close).
  // Never shown below the indexer value: after close the balance drops by the fee while state may still read FUNDING.
  const indexedWei = BigInt(project.totalRaised);
  const raisedWei = (funding && liveBalance && liveBalance.value > indexedWei ? liveBalance.value : indexedWei).toString();
  const progress = fundingProgress(raisedWei, project.fundingGoal);
  const currency = chainCurrency(project.chainId);
  const ethRaised = formatEth(raisedWei, 4);
  const ethGoal = formatEth(project.fundingGoal, 4);
  const aheadOfIndexer = funding && liveBalance !== undefined && liveBalance.value > BigInt(project.totalRaised);
  const profile = project.profile;
  const name = profile?.name ?? project.tokenName;
  const shownState = displayState(project);
  const phaseInput = phaseOf(project);
  const phase = fundingPhase(BigInt(nowSeconds), phaseInput);
  const phaseText = phaseLabel(phase, phaseInput);

  const deadlineDate = utcDate(project.fundingDeadline);
  const fundingOpen = phase === "OPEN" || phase === "CLOSEABLE";
  const escrowUrl = explorerAddressUrl(project.chainId, project.escrowAddress);

  return (
    <div className="page-container layout-container">
      <Link href="/projects" className="page-back">
        <ArrowLeft size={14} aria-hidden="true" />
        Back to projects
      </Link>

      <header className="detail-header fade-in-up">
        <ProjectLogo name={name} logoUrl={profile?.logoUrl} />
        <div className="detail-header-main">
          <h1>{name || "Unnamed Project"}</h1>
          <div className="detail-meta">
            {project.tokenSymbol && <span className="chip mono">{project.tokenSymbol}</span>}
            <span className="chip">{chainName(project.chainId)}</span>
            <ProjectStatusBadge status={shownState} />
            <AddressChip address={project.escrowAddress} href={escrowUrl ?? undefined} />
          </div>
          {phaseText && <p className="detail-phase">{phaseText}</p>}
        </div>
        {(profile?.websiteUrl || profile?.pitchDeckUrl) && (
          <div className="detail-links">
            {profile?.websiteUrl && (
              <a href={profile.websiteUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                <Globe size={14} aria-hidden="true" />
                Website
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
            {profile?.pitchDeckUrl && (
              <a href={profile.pitchDeckUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("secondary", "sm")}>
                <FileText size={14} aria-hidden="true" />
                Pitch deck
                <span className="sr-only"> (opens in a new tab)</span>
              </a>
            )}
          </div>
        )}
      </header>

      <section className="kpi-grid" aria-label="Key figures">
        <StatCard
          label="Raised"
          value={ethRaised}
          unit={currency}
          icon={<Coins size={16} />}
          hint={
            <>
              <div
                className="progress-bar kpi-progress"
                role="progressbar"
                aria-label="Funding progress"
                aria-valuemin={0}
                aria-valuemax={100}
                aria-valuenow={progress}
                style={{ marginBottom: 6 }}
              >
                <div className="progress-fill" style={{ width: `${progress}%` }} />
              </div>
              <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>{progress}%</span> of{" "}
              <Amount value={ethGoal} unit={currency} /> goal
              {aheadOfIndexer && <div style={{ marginTop: 4 }}>Updating from the chain; the indexer is catching up</div>}
            </>
          }
        />
        <MilestoneKpi project={project} milestones={milestones} />
        <StatCard
          label="Funding deadline"
          value={fundingOpen ? (deadlineDate ?? "-") : "Closed"}
          icon={<CalendarClock size={16} />}
          hint={fundingOpen ? (phase === "CLOSEABLE" ? "Close window open (UTC date)" : "Funding open (UTC date)") : deadlineDate ? `Deadline was ${deadlineDate}` : undefined}
        />
      </section>

      <div className="detail-layout">
        <div className="detail-main">
          {(profile?.description || profile?.founderBio) && (
            <Card className="fade-in-up">
              <CardHeader title="About" />
              <CardBody>
                {profile?.description && <p className="desc-text">{profile.description}</p>}
                {profile?.founderBio && (
                  <div className={profile.description ? "panel-section" : undefined}>
                    <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>About the founder</h3>
                    <p className="desc-text" style={{ fontSize: 14 }}>{profile.founderBio}</p>
                  </div>
                )}
              </CardBody>
            </Card>
          )}

          <ProfileEditor project={project} />

          <MilestoneTimeline project={project} milestones={milestones} />

          <section aria-labelledby="governance-heading" className="detail-main">
            <h2 id="governance-heading" className="sr-only">Transparency and governance</h2>
            <MilestonePanel project={project} nowSeconds={nowSeconds} />
            <TransparencyPanel project={project} />
            <GasLedger project={project} />
            <TakeoverPanel chainId={project.chainId} escrowAddress={project.escrowAddress} />
          </section>

          <Link href={`/projects/${encodeURIComponent(id)}/milestones`} className="ui-card cta-link">
            <span style={{ display: "flex", alignItems: "center", gap: 12 }}>
              <span className="feature-icon feature-icon-sm" aria-hidden="true">
                <Vote size={16} />
              </span>
              <span>
                <span style={{ display: "block", fontWeight: 600 }}>Milestone governance</span>
                <span className="cta-link-sub">Vote on milestones and release funds</span>
              </span>
            </span>
            <ArrowRight size={18} aria-hidden="true" style={{ color: "var(--accent)", flexShrink: 0 }} />
          </Link>

          <Card>
            <CardHeader
              title={
                <span className="panel-title">
                  <Link2 size={16} aria-hidden="true" />
                  Contract details
                </span>
              }
            />
            <CardBody style={{ paddingTop: 8 }}>
              <div className="kv-list">
                <div className="kv-row">
                  <span>Escrow</span>
                  <AddressChip address={project.escrowAddress} href={escrowUrl ?? undefined} />
                </div>
                <div className="kv-row">
                  <span>Token</span>
                  <AddressChip address={project.tokenAddress} href={explorerAddressUrl(project.chainId, project.tokenAddress) ?? undefined} />
                </div>
                <div className="kv-row">
                  <span>Developer</span>
                  <AddressChip address={project.developer} href={explorerAddressUrl(project.chainId, project.developer) ?? undefined} />
                </div>
                <div className="kv-row">
                  <span>Network</span>
                  <span>{chainName(project.chainId)}</span>
                </div>
              </div>
              {escrowUrl && (
                <a href={escrowUrl} target="_blank" rel="noopener noreferrer" className="panel-note" style={{ display: "inline-flex", alignItems: "center", gap: 6, marginTop: 12 }}>
                  View escrow on the explorer
                  <ExternalLink size={12} aria-hidden="true" />
                </a>
              )}
            </CardBody>
          </Card>

          <ReportProblem projectId={project.id} />
        </div>

        <aside className="detail-side" aria-label="Project actions">
          <DeveloperPanel project={project} nowSeconds={nowSeconds} />
          <CreatorFunds project={project} />
          <GuardianPanel project={project} nowSeconds={nowSeconds} />
          <FundingGate project={project} nowSeconds={nowSeconds} onFunded={() => void refetchBalance()} />
          <InvestorPanel project={project} nowSeconds={nowSeconds} />
        </aside>
      </div>
    </div>
  );
}

function LoadingSkeleton() {
  return (
    <div className="page-container layout-container" role="status" aria-live="polite">
      <span className="sr-only">Loading project</span>
      <Skeleton width={120} height={12} style={{ marginBottom: 20 }} />
      <div className="detail-header">
        <Skeleton width={56} height={56} radius="var(--r-md)" />
        <div className="detail-header-main">
          <Skeleton width="45%" height={26} style={{ marginBottom: 10 }} />
          <Skeleton width="30%" height={14} />
        </div>
      </div>
      <div className="kpi-grid">
        {[1, 2, 3].map(n => (
          <StatCard key={n} label={<Skeleton width={80} height={12} />} value="" loading />
        ))}
      </div>
      <div className="detail-layout">
        <div className="detail-main">
          <Card style={{ height: 220 }} aria-hidden="true" />
          <Card style={{ height: 300 }} aria-hidden="true" />
        </div>
        <div className="detail-side">
          <Card style={{ height: 260 }} aria-hidden="true" />
        </div>
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
