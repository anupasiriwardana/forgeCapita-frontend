"use client";

import Link from "next/link";
import type { Project } from "@/lib/api";
import { formatEth, fundingProgress, shortAddr } from "@/lib/api";

interface ProjectCardProps {
  project: Project;
  index?: number;
}

export function ProjectCard({ project, index = 0 }: ProjectCardProps) {
  const progress = fundingProgress(project.total_raised, project.funding_goal);
  const ethRaised = formatEth(project.total_raised, 3);
  const ethGoal = formatEth(project.funding_goal, 3);

  return (
    <Link
      href={`/projects/${project.id}`}
      className="glass-card fade-in-up"
      style={{
        display: "block",
        textDecoration: "none",
        padding: "24px",
        animationDelay: `${index * 0.07}s`,
        cursor: "pointer",
      }}
    >
      {/* Header */}
      <div style={{ display: "flex", alignItems: "flex-start", gap: "14px", marginBottom: "16px" }}>
        {/* Logo */}
        <div
          style={{
            width: "52px",
            height: "52px",
            borderRadius: "12px",
            overflow: "hidden",
            background: "linear-gradient(135deg, rgba(99,102,241,0.2), rgba(139,92,246,0.2))",
            border: "1px solid rgba(99,102,241,0.3)",
            flexShrink: 0,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            fontSize: "22px",
          }}
        >
          {project.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={project.logo_url}
              alt={project.name ?? "Project"}
              style={{ width: "100%", height: "100%", objectFit: "cover" }}
              onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
            />
          ) : (
            "🚀"
          )}
        </div>

        {/* Title */}
        <div style={{ flex: 1, minWidth: 0 }}>
          <h3
            style={{
              fontSize: "16px",
              fontWeight: 700,
              color: "var(--text-primary)",
              margin: "0 0 4px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {project.name ?? "Unnamed Project"}
          </h3>
          <span style={{ fontSize: "11px", color: "var(--text-muted)", fontFamily: "monospace" }}>
            {shortAddr(project.id)}
          </span>
        </div>

        {/* Status Badge */}
        <span className={`badge ${project.is_funding_active ? "badge-active" : "badge-inactive"}`}>
          <span
            style={{
              width: "5px",
              height: "5px",
              borderRadius: "50%",
              background: "currentColor",
              flexShrink: 0,
            }}
          />
          {project.is_funding_active ? "Live" : "Closed"}
        </span>
      </div>

      {/* Description */}
      {project.description && (
        <p
          style={{
            fontSize: "13px",
            color: "var(--text-secondary)",
            lineHeight: 1.6,
            marginBottom: "20px",
            display: "-webkit-box",
            WebkitLineClamp: 2,
            WebkitBoxOrient: "vertical",
            overflow: "hidden",
          }}
        >
          {project.description}
        </p>
      )}

      {/* Progress */}
      <div style={{ marginBottom: "16px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", marginBottom: "6px" }}>
          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>Funding Progress</span>
          <span style={{ fontSize: "12px", fontWeight: 600, color: "var(--brand-accent)" }}>{progress}%</span>
        </div>
        <div className="progress-bar">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: "flex", gap: "12px" }}>
        <div className="stat-card" style={{ flex: 1 }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Raised</div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--emerald)" }}>{ethRaised} ETH</div>
        </div>
        <div className="stat-card" style={{ flex: 1 }}>
          <div style={{ fontSize: "11px", color: "var(--text-muted)", marginBottom: "4px", textTransform: "uppercase", letterSpacing: "0.05em" }}>Goal</div>
          <div style={{ fontSize: "15px", fontWeight: 700, color: "var(--text-primary)" }}>{ethGoal} ETH</div>
        </div>
      </div>

      {/* Footer */}
      <div
        style={{
          marginTop: "16px",
          paddingTop: "14px",
          borderTop: "1px solid var(--border)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
          Developer: {shortAddr(project.developer)}
        </span>
        <span
          style={{
            fontSize: "12px",
            fontWeight: 600,
            color: "var(--brand-accent)",
            display: "flex",
            alignItems: "center",
            gap: "4px",
          }}
        >
          View Details →
        </span>
      </div>
    </Link>
  );
}
