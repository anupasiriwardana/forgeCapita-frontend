import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { fetchAllProjects } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Marketplace — ForgeCapita",
  description:
    "Browse all active Web3 startup projects. Fund milestone-gated ventures and earn equity tokens on the Ethereum Sepolia testnet.",
};

function ProjectsSkeleton() {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
        gap: "24px",
      }}
    >
      {[1, 2, 3].map((n) => (
        <div
          key={n}
          className="glass-card"
          style={{
            height: "360px",
            background: "rgba(255,255,255,0.02)",
            borderRadius: "16px",
            border: "1px solid rgba(255,255,255,0.06)",
            animation: "pulse 1.8s infinite ease-in-out",
          }}
        />
      ))}
    </div>
  );
}

async function ProjectsSection() {
  const projects = await fetchAllProjects();

  return (
    <>
      {/* Divider with project count or status */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
        <div className="divider" style={{ flex: 1, margin: 0 }} />
        <span style={{ fontSize: "13px", color: "var(--text-muted)", whiteSpace: "nowrap", fontWeight: 600 }}>
          {projects.length > 0
            ? `${projects.length} active project${projects.length !== 1 ? "s" : ""}`
            : "No active projects yet"}
        </span>
        <div className="divider" style={{ flex: 1, margin: 0 }} />
      </div>

      {/* Grid or Empty State */}
      {projects.length > 0 ? (
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))",
            gap: "24px",
          }}
        >
          {projects.map((project, i) => (
            <ProjectCard key={project.id} project={project} index={i} />
          ))}
        </div>
      ) : (
        <div
          className="fade-in-up"
          style={{
            textAlign: "center",
            padding: "80px 24px",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "24px",
            border: "1px dashed rgba(255, 255, 255, 0.12)",
            maxWidth: "600px",
            margin: "0 auto",
          }}
        >
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>🌱</div>
          <h2 style={{ fontSize: "24px", fontWeight: 700, marginBottom: "10px", color: "var(--text-primary)" }}>
            No Projects Yet
          </h2>
          <p
            style={{
              color: "var(--text-secondary)",
              fontSize: "15px",
              lineHeight: 1.6,
              maxWidth: "440px",
              margin: "0 auto 28px",
            }}
          >
            There are currently no startup projects in the database.
            Be the first founder to launch a milestone-gated project on ForgeCapita!
          </p>
          <Link
            href="/projects/create"
            className="btn-primary"
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "8px",
              textDecoration: "none",
              padding: "12px 28px",
              fontSize: "15px",
              fontWeight: 600,
            }}
          >
            🚀 Launch Your Project
          </Link>
        </div>
      )}
    </>
  );
}

export default function DashboardPage() {
  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Hero Section */}
      <div className="fade-in-up" style={{ textAlign: "center", marginBottom: "64px" }}>
        <span className="section-tag">⚡ Live on Sepolia</span>
        <h1
          style={{
            fontSize: "clamp(36px, 5vw, 60px)",
            fontWeight: 900,
            margin: "0 0 20px",
            lineHeight: 1.1,
          }}
        >
          Back the Future of <span className="gradient-text">Web3 SaaS</span>
        </h1>
        <p
          style={{
            fontSize: "18px",
            color: "var(--text-secondary)",
            maxWidth: "560px",
            margin: "0 auto 32px",
            lineHeight: 1.7,
          }}
        >
          Milestone-gated crowdfunding where your investment is protected by governance. Fund, vote,
          and trade equity tokens.
        </p>

        {/* Hero features / stats */}
        <div style={{ display: "flex", justifyContent: "center", gap: "32px", flexWrap: "wrap" }}>
          {[
            { label: "Network", value: "Sepolia Testnet", icon: "🔗" },
            { label: "Milestones", value: "On-Chain Escrow", icon: "🛡️" },
            { label: "Governance", value: "Token Weighted", icon: "🗳️" },
          ].map(({ label, value, icon }) => (
            <div
              key={label}
              className="stat-card fade-in-up-2"
              style={{ padding: "16px 24px", minWidth: "140px", textAlign: "center" }}
            >
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>{icon}</div>
              <div style={{ fontSize: "16px", fontWeight: 700, color: "var(--text-primary)" }}>
                {value}
              </div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                {label}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Projects streaming section */}
      <Suspense fallback={<ProjectsSkeleton />}>
        <ProjectsSection />
      </Suspense>
    </div>
  );
}
