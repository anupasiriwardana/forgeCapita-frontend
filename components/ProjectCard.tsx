"use client";

import Link from "next/link";
import { ArrowRight, CalendarClock, Flag } from "lucide-react";
import { ProjectLogo } from "@/components/ProjectLogo";
import { ProjectStatusBadge } from "@/components/ProjectStatusBadge";
import { Amount } from "@/components/ui/Amount";
import type { ProjectDto } from "@/lib/api";
import { formatEth, fundingProgress } from "@/lib/api";
import { chainCurrency, chainName } from "@/config/chains";
import { displayState } from "@/lib/projectState";

interface ProjectCardProps {
  project: ProjectDto;
  index?: number;
}

/** Unix seconds as YYYY-MM-DD in UTC; deterministic on server and client, so no hydration mismatch. */
function utcDate(seconds: string): string | null {
  const ms = Number(seconds) * 1000;
  if (!Number.isFinite(ms) || ms <= 0) return null;
  return new Date(ms).toISOString().slice(0, 10);
}

function ProgressInfo({ project }: { project: ProjectDto }): React.ReactElement | null {
  if (project.state === "FUNDING") {
    const deadline = utcDate(project.fundingDeadline);
    if (!deadline) return null;
    return (
      <span className="project-card-info">
        <CalendarClock size={14} aria-hidden="true" />
        <span>
          Ends <span className="num">{deadline}</span>
          <span className="sr-only"> (funding deadline, UTC)</span>
        </span>
      </span>
    );
  }
  if (project.state === "ACTIVE") {
    return (
      <span className="project-card-info">
        <Flag size={14} aria-hidden="true" />
        Milestone <span className="num">{project.currentMilestoneIndex + 1}</span> in progress
      </span>
    );
  }
  return null;
}

export function ProjectCard({ project, index = 0 }: ProjectCardProps): React.ReactElement {
  const progress = fundingProgress(project.totalRaised, project.fundingGoal);
  const currency = chainCurrency(project.chainId);
  const name = project.profile?.name ?? project.tokenName;
  const description = project.profile?.description;
  const logoUrl = project.profile?.logoUrl;

  return (
    <Link
      href={`/projects/${encodeURIComponent(project.id)}`}
      className="ui-card project-card fade-in-up"
      style={{ animationDelay: `${Math.min(index, 5) * 0.03}s` }}
    >
      <div className="project-card-head">
        <ProjectLogo name={name} logoUrl={logoUrl} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3 className="project-card-title">{name || "Unnamed Project"}</h3>
          <div className="project-card-meta">
            {project.tokenSymbol && <span className="chip mono">{project.tokenSymbol}</span>}
            <span className="chip">{chainName(project.chainId)}</span>
          </div>
        </div>
        <ProjectStatusBadge status={displayState(project)} />
      </div>

      {description && <p className="project-card-desc">{description}</p>}

      <div>
        <div className="project-card-amounts">
          <span>
            <span className="sr-only">Raised </span>
            <Amount value={formatEth(project.totalRaised, 3)} unit={currency} className="project-card-raised" />
          </span>
          <span className="project-card-goal">
            of <Amount value={formatEth(project.fundingGoal, 3)} unit={currency} />
          </span>
        </div>
        <div
          className="progress-bar"
          role="progressbar"
          aria-label="Funding progress"
          aria-valuemin={0}
          aria-valuemax={100}
          aria-valuenow={progress}
        >
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
        <div className="project-card-pct">
          <span className="num" style={{ color: "var(--text)", fontWeight: 600 }}>{progress}%</span> funded
        </div>
      </div>

      <div className="project-card-foot">
        <ProgressInfo project={project} />
        <span className="project-card-cta">
          View project
          <ArrowRight size={14} aria-hidden="true" />
        </span>
      </div>
    </Link>
  );
}
