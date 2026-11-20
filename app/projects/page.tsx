import type { Metadata } from "next";
import { Suspense } from "react";
import { ArrowLeft, ArrowRight, Rocket, SearchX, Sprout } from "lucide-react";
import { listProjects, type ProjectDto } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";
import { MarketplaceFilters as MarketplaceFiltersPanel } from "@/components/MarketplaceFilters";
import { PageHero } from "@/components/PageHero";
import { ProjectsLoadError } from "@/components/ProjectsLoadError";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
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

function ProjectsSkeleton(): React.ReactElement {
  return (
    <div role="status" aria-live="polite">
      <span className="sr-only">Loading projects</span>
      <Skeleton width={140} height={14} style={{ marginBottom: 16 }} />
      <div className="project-grid">
        {[1, 2, 3, 4, 5, 6].map((n) => (
          <Card key={n} className="project-card" aria-hidden="true">
            <div className="project-card-head">
              <Skeleton width={44} height={44} radius="var(--r-md)" />
              <div style={{ flex: 1 }}>
                <Skeleton width="60%" height={14} style={{ marginBottom: 8 }} />
                <Skeleton width="40%" height={12} />
              </div>
            </div>
            <Skeleton width="90%" height={12} />
            <div>
              <Skeleton width="50%" height={18} style={{ marginBottom: 10 }} />
              <Skeleton height={6} radius="var(--r-pill)" />
            </div>
            <Skeleton width="35%" height={12} style={{ marginTop: "auto" }} />
          </Card>
        ))}
      </div>
    </div>
  );
}

async function ProjectsSection({ filters }: { filters: MarketplaceFilters }): Promise<React.ReactElement> {
  let projects: ProjectDto[] = [];
  let total = 0;
  let failed = false;
  try {
    const res = await listProjects(toListParams(filters));
    projects = res.items;
    total = res.total;
  } catch (err) {
    failed = true;
    console.warn("[ProjectsSection] Unable to load projects:", err);
  }

  if (failed) {
    return (
      <Card>
        <ProjectsLoadError message="We could not load projects. Please try again in a moment." />
      </Card>
    );
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
  const countLabel =
    total > 0
      ? `${total} project${total !== 1 ? "s" : ""}${filtered ? " found" : ""}`
      : filtered
        ? "No matching projects"
        : "No projects yet";

  return (
    <>
      <div className="results-bar">
        <span className="num" role="status">
          {countLabel}
        </span>
        {projects.length > 0 && (
          <span className="num">
            Showing {from}-{to} of {total}
          </span>
        )}
      </div>

      {projects.length > 0 ? (
        <>
          <div className="project-grid">
            {projects.map((project, i) => (
              <ProjectCard key={project.id} project={project} index={i} />
            ))}
          </div>
          {(hasPrev || hasNext) && (
            <nav aria-label="Pagination" className="pager">
              {hasPrev && (
                <ButtonLink href={pageHref(filters.page - 1)} variant="secondary" size="sm" leftIcon={<ArrowLeft size={14} aria-hidden="true" />}>
                  Previous
                </ButtonLink>
              )}
              <span className="num">Page {filters.page}</span>
              {hasNext && (
                <ButtonLink href={pageHref(filters.page + 1)} variant="secondary" size="sm" rightIcon={<ArrowRight size={14} aria-hidden="true" />}>
                  Next
                </ButtonLink>
              )}
            </nav>
          )}
        </>
      ) : filtered || filters.page > 1 ? (
        <Card className="fade-in-up">
          <EmptyState
            icon={<SearchX size={20} />}
            title="No projects match these filters"
            text="Try a different search, status or chain."
            action={
              <ButtonLink href="/projects" variant="secondary" size="sm">
                Clear filters
              </ButtonLink>
            }
          />
        </Card>
      ) : (
        <Card className="fade-in-up">
          <EmptyState
            icon={<Sprout size={20} />}
            title="No projects yet"
            text="There are currently no startup projects. Be the first founder to launch a milestone-gated project on ForgeCapita."
            action={
              <ButtonLink href="/founder/launch" leftIcon={<Rocket size={16} aria-hidden="true" />}>
                Launch your project
              </ButtonLink>
            }
          />
        </Card>
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
    <div className="page-container">
      <PageHero
        eyebrow="Marketplace"
        title="Browse projects"
        intro="Milestone-gated crowdfunding where your investment is protected by governance."
      />

      <MarketplaceFiltersPanel key={filters.q || filters.category ? "text" : "clear"} current={filters} />
      <Suspense key={suspenseKey} fallback={<ProjectsSkeleton />}>
        <ProjectsSection filters={filters} />
      </Suspense>
    </div>
  );
}
