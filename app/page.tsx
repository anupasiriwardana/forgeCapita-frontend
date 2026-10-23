import type { Metadata } from "next";
import { fetchAllProjects } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";

export const metadata: Metadata = {
  title: "Marketplace — ForgeCapita",
  description: "Browse all active Web3 startup projects. Fund milestone-gated ventures and earn equity tokens on the Ethereum Sepolia testnet.",
};

export default async function DashboardPage() {
  let projects = [];
  let error: string | null = null;

  try {
    projects = await fetchAllProjects();
  } catch (e) {
    error = e instanceof Error ? e.message : "Failed to load projects";
  }

  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
      {/* Hero Section */}
      <div className="fade-in-up" style={{ textAlign: "center", marginBottom: "64px" }}>
        <span className="section-tag">⚡ Live on Sepolia</span>
        <h1
          style={{ fontSize: "clamp(36px, 5vw, 60px)", fontWeight: 900, margin: "0 0 20px", lineHeight: 1.1 }}
        >
          Back the Future of{" "}
          <span className="gradient-text">Web3 SaaS</span>
        </h1>
        <p style={{ fontSize: "18px", color: "var(--text-secondary)", maxWidth: "560px", margin: "0 auto 32px", lineHeight: 1.7 }}>
          Milestone-gated crowdfunding where your investment is protected by governance. Fund, vote, and trade equity tokens.
        </p>

        {/* Hero stats */}
        <div style={{ display: "flex", justifyContent: "center", gap: "32px", flexWrap: "wrap" }}>
          {[
            { label: "Projects Live", value: projects.length.toString(), icon: "🚀" },
            { label: "Network", value: "Sepolia", icon: "🔗" },
            { label: "Governance", value: "On-Chain", icon: "🗳️" },
          ].map(({ label, value, icon }) => (
            <div key={label} className="stat-card fade-in-up-2" style={{ padding: "16px 24px", minWidth: "120px", textAlign: "center" }}>
              <div style={{ fontSize: "20px", marginBottom: "6px" }}>{icon}</div>
              <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text-primary)" }}>{value}</div>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>{label}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Divider */}
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
        <div className="divider" style={{ flex: 1, margin: 0 }} />
        <span style={{ fontSize: "13px", color: "var(--text-muted)", whiteSpace: "nowrap", fontWeight: 600 }}>
          {projects.length > 0 ? `${projects.length} active project${projects.length !== 1 ? "s" : ""}` : "No projects yet"}
        </span>
        <div className="divider" style={{ flex: 1, margin: 0 }} />
      </div>

      {/* Error state */}
      {error && (
        <div className="alert alert-error" style={{ marginBottom: "32px" }}>
          <span>⚠️</span>
          <div>
            <div style={{ fontWeight: 600, marginBottom: "4px" }}>Failed to load projects</div>
            <div style={{ fontSize: "13px", opacity: 0.8 }}>{error} — ensure the ForgeCapita API is running at{" "}
              <code style={{ background: "rgba(255,255,255,0.1)", padding: "1px 5px", borderRadius: "4px" }}>
                localhost:3001
              </code>
            </div>
          </div>
        </div>
      )}

      {/* Project Grid */}
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
      ) : !error ? (
        <div style={{ textAlign: "center", padding: "80px 24px" }}>
          <div style={{ fontSize: "56px", marginBottom: "16px" }}>🌱</div>
          <h2 style={{ fontSize: "22px", marginBottom: "8px", color: "var(--text-primary)" }}>No Projects Yet</h2>
          <p style={{ color: "var(--text-muted)", marginBottom: "24px" }}>
            Be the first to launch a milestone-gated project on ForgeCapita.
          </p>
          <a href="/projects/create" className="btn-primary" style={{ display: "inline-flex" }}>
            🚀 Launch Your Project
          </a>
        </div>
      ) : null}
    </div>
  );
}
