"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useReadContracts } from "wagmi";
import { useQueries } from "@tanstack/react-query";
import { RevenueReport } from "@/components/RevenueReport";
import { complianceBadge, formatBps } from "@/components/TransparencyPanel";
import { ABIS } from "@/lib/contracts";
import { useAuth } from "@/components/web3/AuthProvider";
import { chainName } from "@/config/chains";
import { FOUNDER_COMPLIANCE_TEXT } from "@/lib/founderCompliance";
import { exactTime, formatAge } from "@/lib/timeAgo";
import {
  fetchOwnRepos,
  fetchProjectRevenue,
  formatNative,
  getProjectTransparency,
  getTakeoverByProject,
  listProjects,
  shortAddr,
  type OwnRepoDto,
  type ProjectDto,
  type ProjectState,
  type PublicTakeoverCaseDto,
  type TransparencyDto,
} from "@/lib/api";

const MUTED = { fontSize: "13px", color: "var(--text-muted)" } as const;
const LINK = { color: "var(--brand-accent)" } as const;

const STATE_BADGE: Record<ProjectState, string> = {
  FUNDING: "badge-active",
  ACTIVE: "badge-active",
  COMPLETED: "badge-brand",
  FAILED: "badge-inactive",
  CANCELLED: "badge-inactive",
  SHUTDOWN: "badge-danger",
};

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

function ComplianceBlock({ project }: { project: ProjectDto }) {
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
  return (
    <div style={{ marginTop: "12px", paddingTop: "12px", borderTop: "1px solid var(--border)" }}>
      <p style={{ marginBottom: "6px" }}>
        Revenue compliance:{" "}
        <span className={`badge ${complianceBadge(state)}`}>{state === "not_checked" ? "not checked" : state}</span>
      </p>
      <p style={{ fontSize: "14px", marginBottom: "6px" }}>{FOUNDER_COMPLIANCE_TEXT[state]}</p>
      {data.observedNative != null && data.routedNative != null && (
        <p style={{ fontSize: "14px" }}>
          Observed {formatNative(data.observedNative, data.chainId)} vs routed{" "}
          {formatNative(data.routedNative, data.chainId)} (last {data.windowDays} days)
        </p>
      )}
      {data.shortfallBps != null && (
        <p style={MUTED}>
          Shortfall {formatBps(data.shortfallBps)} (tolerance {formatBps(data.toleranceBps)})
        </p>
      )}
      <p style={MUTED} title={exactTime(data.lastCheckedAt)}>
        Last checked: {formatAge(data.lastCheckedAt, now)}
      </p>
      <p style={MUTED}>The check refreshes about every 15 minutes (configurable).</p>
      {state === "WARNED" && (
        <p style={MUTED}>
          The indexer might be behind, so ignore the warning if you have already routed the revenue. This check runs
          periodically on indexed data; see &quot;last checked&quot; above.
        </p>
      )}
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
    <div className="alert alert-warning" style={{ marginTop: "12px" }}>
      {item.status === "vote_open" ? (
        <span>
          A takeover vote is open (ends {item.endsAt ? new Date(item.endsAt).toLocaleString() : "soon"}). The community is
          voting on replacing the developer with {shortAddr(item.candidateWallet)}. The result is advisory; staff decide.
        </span>
      ) : (
        <span>
          Vote closed: {item.result ? (TAKEOVER_RESULT[item.result] ?? item.result) : "no result"}. Staff may propose a new
          developer on-chain.
        </span>
      )}{" "}
      <Link href={href} style={LINK}>View project</Link>
    </div>
  );
}

function isRevenueState(project: ProjectDto): boolean {
  return project.state === "ACTIVE" || project.state === "COMPLETED";
}

/** undefined = still loading, null = unavailable, bigint = amount in wei. */
type Claimable = bigint | null | undefined;

function ClaimableLine({ project, claimable }: { project: ProjectDto; claimable: Claimable }) {
  let text: string;
  if (claimable === undefined) text = "Checking...";
  else if (claimable === null) text = "Not available";
  else text = formatNative(claimable.toString(), project.chainId, 6);
  return (
    <p style={{ fontSize: "14px", marginBottom: "8px" }}>
      Claimable creator funds: <strong>{text}</strong>
      {typeof claimable === "bigint" && claimable > BigInt(0) && (
        <>
          {" "}
          <Link href={`/projects/${encodeURIComponent(project.id)}`} style={LINK}>Claim on project page</Link>
        </>
      )}
    </p>
  );
}

type FounderProjectsView = "projects" | "revenue";

function ProjectRow({
  project,
  repo,
  claimable,
  view,
}: {
  project: ProjectDto;
  repo: OwnRepoDto | undefined;
  claimable: Claimable;
  view: FounderProjectsView;
}) {
  const name = project.profile?.name ?? project.tokenName;
  const pct = progressPercent(project.totalRaised, project.fundingGoal);
  const revenueView = view === "revenue";
  const showCompliance =
    project.state !== "FUNDING" && project.state !== "CANCELLED" && (revenueView || !isRevenueState(project));
  const repoLink = repo && repo.htmlUrl.startsWith("https://") ? repo : undefined;

  return (
    <div style={{ padding: "16px 0", borderBottom: "1px solid var(--border)" }}>
      <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
        <strong>{name}</strong>
        <span style={MUTED}>{chainName(project.chainId)}</span>
        <span className={`badge ${STATE_BADGE[project.state]}`}>{project.state}</span>
        {project.state === "ACTIVE" && <span style={MUTED}>Milestone {project.currentMilestoneIndex}</span>}
      </div>
      {!revenueView && (
        <>
          <p style={{ fontSize: "14px", margin: "8px 0 4px" }}>
            Raised {formatNative(project.totalRaised, project.chainId)} of {formatNative(project.fundingGoal, project.chainId)}
          </p>
          <div className="progress-bar" style={{ height: "6px", marginBottom: "8px" }}>
            <div className="progress-fill" style={{ width: `${pct.toString()}%` }} />
          </div>
          <p style={{ fontSize: "14px", marginBottom: "8px" }}>Next action: {NEXT_ACTION[project.state]}</p>
        </>
      )}
      {revenueView && <ClaimableLine project={project} claimable={claimable} />}
      <div style={{ display: "flex", gap: "16px", flexWrap: "wrap", fontSize: "14px" }}>
        <Link href={`/projects/${encodeURIComponent(project.id)}`} style={LINK}>Open project</Link>
        {repoLink && (
          <a href={repoLink.htmlUrl} target="_blank" rel="noopener noreferrer" style={LINK}>
            Repository
          </a>
        )}
      </div>
      {showCompliance && <ComplianceBlock project={project} />}
      {revenueView && <RevenueReport project={project} />}
      {!revenueView && <TakeoverNotice project={project} />}
    </div>
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

  return (
    <>
      {projects.map((p) => (
        <ProjectRow key={p.id} project={p} repo={repos.find((r) => r.projectId === p.id)} claimable={claimableFor(p)} view={view} />
      ))}
    </>
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
    body = <div role="alert" className="alert alert-error">{error}</div>;
  } else if (projects === null) {
    body = <p style={{ color: "var(--text-secondary)" }}>Loading...</p>;
  } else if (view === "revenue" && !projects.some(isRevenueState)) {
    body = <p style={{ color: "var(--text-secondary)" }}>No projects in revenue state yet.</p>;
  } else if (projects.length === 0) {
    body = (
      <p style={{ color: "var(--text-secondary)" }}>
        No projects yet.{" "}
        <Link href="/founder/launch" style={LINK}>Create a project</Link>
        {" or check "}
        <Link href="/founder/launches" style={LINK}>your launch drafts</Link>.
      </p>
    );
  } else {
    body = <ProjectList projects={view === "revenue" ? projects.filter(isRevenueState) : projects} repos={repos} view={view} />;
  }

  return (
    <section id="projects" className="glass-card" style={{ padding: "24px" }}>
      {body}
    </section>
  );
}
