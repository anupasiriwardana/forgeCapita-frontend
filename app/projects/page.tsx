import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Rocket, Sprout } from "lucide-react";
import { listProjects, type ProjectDto } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";
import { MarketplaceFilters as MarketplaceFiltersPanel } from "@/components/MarketplaceFilters";
import {
  PAGE_SIZE,
  canGoNext,
  hasActiveFilters,
  parseFilters,
  toListParams,
  toQueryString,
  type MarketplaceFilters,
} from "@/lib/marketplaceFilters";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Projects — ForgeCapita",
  description:
    "Browse all active Web3 startup projects. Fund milestone-gated ventures and earn equity tokens on Arbitrum Sepolia and BSC Testnet.",
  alternates: { canonical: "/projects" },
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

async function ProjectsSection({ filters }: { filters: MarketplaceFilters }) {
  let projects: ProjectDto[] = [];
  let total = 0;
  try {
    const res = await listProjects(toListParams(filters));
    projects = res.items;
    total = res.total;
  } catch (err) {
    console.warn("[ProjectsSection] Unable to load projects:", err);
  }

  const filtered = hasActiveFilters(filters);
  const from = (filters.page - 1) * PAGE_SIZE + 1;
  const to = from + projects.length - 1;
  const hasPrev = filters.page > 1;
  const hasNext = canGoNext(filters, total);
  const pageHref = (page: number): string => {
    const qs = toQueryString({ ...filters, page });
    return qs ? `/projects?${qs}` : "/projects";
  };
  const pagerStyle = {
    textDecoration: "none",
    padding: "8px 16px",
    fontSize: "14px",
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
  } as const;

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", gap: "16px", marginBottom: "40px" }}>
        <div className="divider" style={{ flex: 1, margin: 0 }} />
        <span style={{ fontSize: "13px", color: "var(--text-muted)", whiteSpace: "nowrap", fontWeight: 600 }}>
          {total > 0
            ? `${total} project${total !== 1 ? "s" : ""}${filtered ? " found" : ""}`
            : filtered
              ? "No matching projects"
              : "No projects yet"}
        </span>
        <div className="divider" style={{ flex: 1, margin: 0 }} />
      </div>

      {projects.length > 0 ? (
        <>
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
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "16px",
              marginTop: "32px",
              flexWrap: "wrap",
            }}
          >
            {hasPrev && (
              <Link href={pageHref(filters.page - 1)} className="btn-secondary" style={pagerStyle}>
                <ArrowLeft size={16} aria-hidden="true" />
                Previous
              </Link>
            )}
            <span style={{ fontSize: "13px", color: "var(--text-muted)", fontWeight: 600 }}>
              Showing {from}-{to} of {total}
            </span>
            {hasNext && (
              <Link href={pageHref(filters.page + 1)} className="btn-secondary" style={pagerStyle}>
                Next
                <ArrowRight size={16} aria-hidden="true" />
              </Link>
            )}
          </div>
        </>
      ) : filtered || filters.page > 1 ? (
        <div
          className="fade-in-up"
          style={{
            textAlign: "center",
            padding: "64px 24px",
            background: "rgba(255, 255, 255, 0.02)",
            borderRadius: "24px",
            border: "1px dashed rgba(255, 255, 255, 0.12)",
            maxWidth: "600px",
            margin: "0 auto",
          }}
        >
          <h2 style={{ fontSize: "22px", fontWeight: 700, marginBottom: "10px", color: "var(--text-primary)" }}>
            No projects match these filters
          </h2>
          <Link href="/projects" className="btn-secondary" style={pagerStyle}>
            Clear filters
          </Link>
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
          <div style={{ marginBottom: "16px", color: "var(--emerald)" }}>
            <Sprout size={48} aria-hidden="true" />
          </div>
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
            href="/founder/launch"
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
            <Rocket size={16} aria-hidden="true" />
            Launch Your Project
          </Link>
        </div>
      )}
    </>
  );
}

export default async function ProjectsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const filters = parseFilters(await searchParams);
  const suspenseKey = toQueryString(filters);
  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
      <div className="fade-in-up" style={{ textAlign: "center", marginBottom: "48px" }}>
        <h1 style={{ fontSize: "clamp(32px, 4.5vw, 48px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.1 }}>
          Browse <span className="gradient-text">Projects</span>
        </h1>
        <p
          style={{
            fontSize: "16px",
            color: "var(--text-secondary)",
            maxWidth: "560px",
            margin: "0 auto",
            lineHeight: 1.7,
          }}
        >
          Milestone-gated crowdfunding where your investment is protected by governance.
        </p>
      </div>

      <MarketplaceFiltersPanel key={filters.q || filters.category ? "text" : "clear"} current={filters} />
      <Suspense key={suspenseKey} fallback={<ProjectsSkeleton />}>
        <ProjectsSection filters={filters} />
      </Suspense>
    </div>
  );
}
