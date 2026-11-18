"use client";

import { useEffect, useId, useState } from "react";
import { useReadContracts } from "wagmi";
import { useQueries } from "@tanstack/react-query";
import { Coins, FolderGit2, HandCoins, Receipt, Rocket, ShieldCheck, Wallet } from "lucide-react";
import { ProjectStatusBadge } from "@/components/ProjectStatusBadge";
import { RevenueReport } from "@/components/RevenueReport";
import { complianceBadge, formatBps } from "@/components/TransparencyPanel";
import { Amount } from "@/components/ui/Amount";
import { ButtonLink, buttonClass } from "@/components/ui/Button";
import { Card, CardBody, CardHeader } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { ErrorState } from "@/components/ui/ErrorState";
import { InlineAlert, type AlertTone } from "@/components/ui/InlineAlert";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatCard } from "@/components/ui/StatCard";
import { StatusPill, type StatusTone } from "@/components/ui/StatusPill";
import { ABIS } from "@/lib/contracts";
import { useAuth } from "@/components/web3/AuthProvider";
import { chainCurrency, chainName } from "@/config/chains";
import { FOUNDER_COMPLIANCE_TEXT } from "@/lib/founderCompliance";
import { exactTime, formatAge } from "@/lib/timeAgo";
import {
  fetchOwnRepos,
  fetchProjectRevenue,
  formatEth,
  formatNative,
  getProjectTransparency,
  getTakeoverByProject,
  listProjects,
  shortAddr,
  type ComplianceState,
  type OwnRepoDto,
  type ProjectDto,
  type ProjectRevenueDto,
  type ProjectState,
  type PublicTakeoverCaseDto,
  type TransparencyDto,
} from "@/lib/api";

type ComplianceView = ComplianceState | "not_checked";

function complianceTone(state: ComplianceView): StatusTone {
  const badge = complianceBadge(state);
  if (badge === "badge-active") return "success";
  if (badge === "badge-danger") return "danger";
  if (badge === "badge-pending") return "warning";
  return "neutral";
}

function complianceAlertTone(state: ComplianceView): AlertTone {
  if (state === "OK" || state === "RESOLVED") return "success";
  if (state === "SHUTDOWN") return "danger";
  if (state === "not_checked") return "info";
  return "warning";
}

const NEXT_ACTION: Record<ProjectState, string> = {
  FUNDING: "Open the project to close funding and start",
  ACTIVE: "Manage milestones and claim creator funds on the project page",
  COMPLETED: "All milestones are done. Nothing is required from you.",
  FAILED: "A milestone failed and investors can claim refunds. Nothing more can be done on this project.",
  CANCELLED: "Funding was cancelled and investors can claim refunds.",
  SHUTDOWN: "Staff shut this project down. Contact support if you disagree.",
};

const TAKEOVER_RESULT: Record<string, string> = {
  passed: "passed",
  failed: "failed",
  no_quorum: "no quorum",
};

/** Integer percent (0-100) from decimal wei strings using bigint math only. */
function progressPercent(raised: string, goal: string): number {
  try {
    const goalWei = BigInt(goal);
    if (goalWei <= BigInt(0)) return 0;
    const pct = (BigInt(raised) * BigInt(100)) / goalWei;
    return pct >= BigInt(100) ? 100 : Number(pct);
  } catch {
    return 0;
  }
}

function ComplianceBlock({ project, variant }: { project: ProjectDto; variant: "card" | "inline" }) {
  const [data, setData] = useState<TransparencyDto | null>(null);
  const [now, setNow] = useState<number>(() => Date.now());

  useEffect(() => {
    const controller = new AbortController();
    getProjectTransparency(project.id, controller.signal)
      .then((d) => {
        if (controller.signal.aborted) return;
        setNow(Date.now());
        setData(d);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [project.id]);

  if (!data || data.auditStatus === "unaudited") return null;
  const state = data.complianceState ?? "not_checked";
  const pill = <StatusPill tone={complianceTone(state)}>{state === "not_checked" ? "not checked" : state}</StatusPill>;
  const details = (
    <>
      <InlineAlert tone={complianceAlertTone(state)}>{FOUNDER_COMPLIANCE_TEXT[state]}</InlineAlert>
      <div className="facts">
        {data.observedNative != null && data.routedNative != null && (
          <p className="num" style={{ color: "var(--text)" }}>
            Observed {formatNative(data.observedNative, data.chainId)} vs routed{" "}
            {formatNative(data.routedNative, data.chainId)} (last {data.windowDays} days)
          </p>
        )}
        {data.shortfallBps != null && (
          <p className="num">
            Shortfall {formatBps(data.shortfallBps)} (tolerance {formatBps(data.toleranceBps)})
          </p>
        )}
        <p title={exactTime(data.lastCheckedAt)}>Last checked: {formatAge(data.lastCheckedAt, now)}</p>
        <p>The check refreshes about every 15 minutes (configurable).</p>
        {state === "WARNED" && (
          <p>
            The indexer might be behind, so ignore the warning if you have already routed the revenue. This check runs
            periodically on indexed data; see &quot;last checked&quot; above.
          </p>
        )}
      </div>
    </>
  );

  if (variant === "card") {
    return (
      <Card>
        <CardHeader
          as="h3"
          title={
            <span className="panel-title">
              <ShieldCheck size={16} aria-hidden="true" />
              Revenue compliance
            </span>
          }
          actions={pill}
        />
        <CardBody>{details}</CardBody>
      </Card>
    );
  }
  return (
    <div className="panel-section">
      <div className="inline-actions panel-gap">
        <span className="panel-note">Revenue compliance:</span>
        {pill}
      </div>
      {details}
    </div>
  );
}

function TakeoverNotice({ project }: { project: ProjectDto }) {
  const [item, setItem] = useState<PublicTakeoverCaseDto | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    getTakeoverByProject(project.chainId, project.escrowAddress, controller.signal)
      .then((c) => {
        if (!controller.signal.aborted) setItem(c);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [project.chainId, project.escrowAddress]);

  if (!item || (item.status !== "vote_open" && item.status !== "closed")) return null;
  const href = `/projects/${encodeURIComponent(project.id)}`;
  return (
    <InlineAlert
      tone="warning"
      title={item.status === "vote_open" ? "Takeover vote open" : "Takeover vote closed"}
      action={
        <ButtonLink href={href} variant="secondary" size="sm">
          View project
        </ButtonLink>
      }
    >
      {item.status === "vote_open" ? (
        <>
          A takeover vote is open (ends {item.endsAt ? new Date(item.endsAt).toLocaleString() : "soon"}). The community is
          voting on replacing the developer with <span className="mono">{shortAddr(item.candidateWallet)}</span>. The result is
          advisory; staff decide.
        </>
      ) : (
        <>
          Vote closed: {item.result ? (TAKEOVER_RESULT[item.result] ?? item.result) : "no result"}. Staff may propose a new
          developer on-chain.
        </>
      )}
    </InlineAlert>
  );
}

function isRevenueState(project: ProjectDto): boolean {
  return project.state === "ACTIVE" || project.state === "COMPLETED";
}

/** undefined = still loading, null = unavailable, bigint = amount in wei. */
type Claimable = bigint | null | undefined;

/** undefined = still loading, null = failed or not indexed yet, otherwise the indexer's revenue report. */
type Revenue = ProjectRevenueDto | null | undefined;

const ACTIONABLE: ReadonlySet<ProjectState> = new Set<ProjectState>(["FUNDING", "ACTIVE"]);

function RepoLink({ repo }: { repo: OwnRepoDto | undefined }) {
  if (!repo || !repo.htmlUrl.startsWith("https://")) return null;
  return (
    <a href={repo.htmlUrl} target="_blank" rel="noopener noreferrer" className={buttonClass("ghost", "sm")}>
      <FolderGit2 size={14} aria-hidden="true" />
      Repository
      <span className="sr-only"> (opens in a new tab)</span>
    </a>
  );
}

function RevenueKpis({ project, claimable, revenue }: { project: ProjectDto; claimable: Claimable; revenue: Revenue }) {
  const currency = chainCurrency(project.chainId);
  const totals = revenue?.totals;
  const loading = revenue === undefined;
  const totalValue = (wei: string | undefined): string => (totals ? formatEth(wei, 6) : "0");
  const noRevenueHint = !loading && !totals ? "No revenue recorded yet" : undefined;

  let claimableValue: string;
  if (claimable === null) claimableValue = "Not available";
  else if (claimable === undefined) claimableValue = "";
  else claimableValue = formatEth(claimable.toString(), 6);

  return (
    <div className="kpi-grid">
      <StatCard
        label="Claimable creator funds"
        value={claimableValue}
        unit={typeof claimable === "bigint" ? currency : undefined}
        loading={claimable === undefined}
        hint={claimable === undefined ? "Checking..." : "Live from the revenue router"}
        icon={<HandCoins size={16} />}
      />
      <StatCard
        label="Total revenue received"
        value={totalValue(totals?.totalGross)}
        unit={currency}
        loading={loading}
        hint={noRevenueHint}
        icon={<Receipt size={16} />}
      />
      <StatCard
        label="Developer share (24%)"
        value={totalValue(totals?.totalCreatorCut)}
        unit={currency}
        loading={loading}
        icon={<Coins size={16} />}
      />
      <StatCard
        label="Claimed"
        value={totalValue(totals?.totalCreatorClaimed)}
        unit={currency}
        loading={loading}
        icon={<Wallet size={16} />}
      />
    </div>
  );
}

type FounderProjectsView = "projects" | "revenue";

interface ProjectRowProps {
  project: ProjectDto;
  repo: OwnRepoDto | undefined;
  claimable: Claimable;
  revenue: Revenue;
}

function ProjectCard({ project, repo }: ProjectRowProps) {
  const name = project.profile?.name ?? project.tokenName;
  const pct = progressPercent(project.totalRaised, project.fundingGoal);
  const currency = chainCurrency(project.chainId);
  const href = `/projects/${encodeURIComponent(project.id)}`;
  const showCompliance = project.state !== "FUNDING" && project.state !== "CANCELLED" && !isRevenueState(project);

  return (
    <Card className="fp-card">
      <div className="fp-head">
        <div style={{ minWidth: 0 }}>
          <h3 className="fp-title">{name}</h3>
          <div className="fp-meta">
            <span className="chip">{chainName(project.chainId)}</span>
            <ProjectStatusBadge status={project.state} />
            {project.state === "ACTIVE" && <span className="chip num">Milestone {project.currentMilestoneIndex}</span>}
          </div>
        </div>
        <RepoLink repo={repo} />
      </div>
      <div className="fp-funding">
        <div className="fp-funding-row">
          <span>
            Raised <Amount value={formatEth(project.totalRaised)} unit={currency} /> of{" "}
            <Amount value={formatEth(project.fundingGoal)} unit={currency} />
          </span>
          <span className="num">{pct}%</span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-label={`Funding progress for ${name}`}
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={pct}
        >
          <div className="progress-fill" style={{ width: `${pct.toString()}%` }} />
        </div>
      </div>
      <div className="fp-next">
        <p className="fp-next-text">
          <strong>Next action:</strong> {NEXT_ACTION[project.state]}
        </p>
        <ButtonLink href={href} variant={ACTIONABLE.has(project.state) ? "primary" : "secondary"} size="sm">
          Open project
        </ButtonLink>
      </div>
      {showCompliance && <ComplianceBlock project={project} variant="inline" />}
      <div className="fp-extra">
        <TakeoverNotice project={project} />
      </div>
    </Card>
  );
}

function RevenueProject({ project, repo, claimable, revenue }: ProjectRowProps) {
  const headingId = useId();
  const name = project.profile?.name ?? project.tokenName;
  const href = `/projects/${encodeURIComponent(project.id)}`;
  const canClaim = typeof claimable === "bigint" && claimable > BigInt(0);

  return (
    <section className="revenue-block" aria-labelledby={headingId}>
      <div className="chain-block-head">
        <div style={{ minWidth: 0 }}>
          <h2 id={headingId}>{name}</h2>
          <div className="fp-meta">
            <span className="chip">{chainName(project.chainId)}</span>
            <ProjectStatusBadge status={project.state} />
          </div>
        </div>
        <div className="inline-actions">
          {canClaim && (
            <ButtonLink href={href} size="sm" leftIcon={<HandCoins size={14} aria-hidden="true" />}>
              Claim on project page
            </ButtonLink>
          )}
          <ButtonLink href={href} variant="secondary" size="sm">
            Open project
          </ButtonLink>
          <RepoLink repo={repo} />
        </div>
      </div>
      <RevenueKpis project={project} claimable={claimable} revenue={revenue} />
      <div className="section-stack">
        <ComplianceBlock project={project} variant="card" />
        <RevenueReport project={project} />
      </div>
    </section>
  );
}

function ProjectList({
  projects,
  repos,
  view,
}: {
  projects: ProjectDto[];
  repos: OwnRepoDto[];
  view: FounderProjectsView;
}) {
  const eligible = projects.filter(isRevenueState);
  const revenueQueries = useQueries({
    queries: eligible.map((p) => ({
      queryKey: ["project-revenue", p.id] as const,
      queryFn: ({ signal }: { signal: AbortSignal }) => fetchProjectRevenue(p.chainId, p.escrowAddress, signal),
    })),
  });

  const routers = eligible.map((p, i) => {
    const router = revenueQueries[i]?.data?.routerAddress;
    return router ? { project: p, router: router as `0x${string}` } : null;
  });
  const withRouter = routers.filter((r): r is { project: ProjectDto; router: `0x${string}` } => r !== null);

  const { data: reads, isLoading: readsLoading } = useReadContracts({
    allowFailure: true,
    contracts: withRouter.map((r) => ({
      address: r.router,
      abi: ABIS.router,
      functionName: "creatorPendingFunds" as const,
      chainId: r.project.chainId,
    })),
    query: { enabled: withRouter.length > 0 },
  });

  function claimableFor(project: ProjectDto): Claimable {
    const idx = eligible.indexOf(project);
    const q = revenueQueries[idx];
    if (!q || q.isLoading) return undefined;
    const routerIdx = withRouter.findIndex((r) => r.project === project);
    if (routerIdx < 0) return null;
    if (readsLoading) return undefined;
    const result = reads?.[routerIdx]?.result;
    return typeof result === "bigint" ? result : null;
  }

  function revenueFor(project: ProjectDto): Revenue {
    const q = revenueQueries[eligible.indexOf(project)];
    if (!q || q.isLoading) return undefined;
    return q.data ?? null;
  }

  const Row = view === "revenue" ? RevenueProject : ProjectCard;
  return (
    <div className={view === "revenue" ? undefined : "fp-list"}>
      {projects.map((p) => (
        <Row
          key={p.id}
          project={p}
          repo={repos.find((r) => r.projectId === p.id)}
          claimable={claimableFor(p)}
          revenue={revenueFor(p)}
        />
      ))}
    </div>
  );
}

export function FounderProjects({ view = "projects" }: { view?: FounderProjectsView }) {
  const { user } = useAuth();
  const address = user?.address;
  const [projects, setProjects] = useState<ProjectDto[] | null>(null);
  const [repos, setRepos] = useState<OwnRepoDto[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!address) return;
    const controller = new AbortController();
    const { signal } = controller;
    listProjects({ developer: address, limit: 100, sort: "created_at", order: "desc" }, signal)
      .then((list) => {
        if (signal.aborted) return;
        setProjects(list.items);
        setError("");
      })
      .catch(() => {
        if (!signal.aborted) setError("Failed to load your projects");
      });
    fetchOwnRepos(signal)
      .then((items) => {
        if (!signal.aborted) setRepos(items);
      })
      .catch(() => undefined);
    return () => controller.abort();
  }, [address]);

  let body: React.ReactNode;
  if (error) {
    body = (
      <Card>
        <ErrorState title="Could not load your projects" message={error} />
      </Card>
    );
  } else if (projects === null) {
    body = (
      <Card className="fp-card" aria-busy="true">
        <span className="sr-only" role="status">Loading...</span>
        <div className="stack-md">
          <Skeleton width="35%" height={16} />
          <Skeleton width="25%" />
          <Skeleton height={6} />
          <Skeleton width="60%" />
        </div>
      </Card>
    );
  } else if (view === "revenue" && !projects.some(isRevenueState)) {
    body = (
      <Card>
        <EmptyState
          icon={<Coins size={20} />}
          title="No projects in revenue state yet."
          text="Revenue shows here once a project is active or completed."
        />
      </Card>
    );
  } else if (projects.length === 0) {
    body = (
      <Card>
        <EmptyState
          icon={<Rocket size={20} />}
          title="No projects yet."
          text="Create a project or check your launch drafts."
          action={
            <div className="inline-actions" style={{ justifyContent: "center" }}>
              <ButtonLink href="/founder/launch" leftIcon={<Rocket size={14} aria-hidden="true" />}>Launch project</ButtonLink>
              <ButtonLink href="/founder/launches" variant="secondary">Your launch drafts</ButtonLink>
            </div>
          }
        />
      </Card>
    );
  } else {
    body = <ProjectList projects={view === "revenue" ? projects.filter(isRevenueState) : projects} repos={repos} view={view} />;
  }

  return (
    <section id="projects" aria-labelledby={view === "projects" ? "founder-projects-heading" : undefined}>
      {view === "projects" && (
        <div className="chain-block-head">
          <h2 id="founder-projects-heading">
            Your projects
            {projects !== null && projects.length > 0 && (
              <span className="num" style={{ color: "var(--text-2)", fontWeight: 500 }}> ({projects.length})</span>
            )}
          </h2>
        </div>
      )}
      {body}
    </section>
  );
}
