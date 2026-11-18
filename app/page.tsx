import type { Metadata } from "next";
import { ArrowRight, ChevronDown, Coins, Fuel, Network, ScanSearch, SearchX, ShieldCheck, Sprout, Vote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { listProjects, type ProjectDto } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";
import { ButtonLink } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { StatCard } from "@/components/ui/StatCard";
import { StatusPill } from "@/components/ui/StatusPill";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "ForgeCapita — Web3 Milestone-Gated Crowdfunding",
  description:
    "Milestone-gated crowdfunding where your investment is protected by governance. Fund, vote, and share in revenue on Arbitrum Sepolia and BSC Testnet.",
  alternates: { canonical: "/" },
};

const FEATURED_LIMIT = 3;

const STEPS: ReadonlyArray<{ title: string; text: string; Icon: LucideIcon }> = [
  {
    title: "Fund",
    text: "Back a project with testnet ETH or BNB during its funding window and claim your share of the public token supply.",
    Icon: Coins,
  },
  {
    title: "Milestones",
    text: "Funds stay in escrow. Each milestone is released only after staked investors approve it with a vote.",
    Icon: Vote,
  },
  {
    title: "Revenue share",
    text: "Customer payments are split on-chain, and stakers claim their share of the revenue.",
    Icon: Sprout,
  },
];

const TRUST: ReadonlyArray<{ title: string; text: string; Icon: LucideIcon }> = [
  {
    title: "Escrowed milestones",
    text: "Raised funds sit in an escrow contract and are released one milestone at a time, never all up front.",
    Icon: ShieldCheck,
  },
  {
    title: "Staked voting",
    text: "Voting weight is your staked balance, and a vote locks the stake until the poll closes.",
    Icon: Vote,
  },
  {
    title: "Revenue audit",
    text: "Payments into each founder's approved wallets are compared with revenue routed on-chain, and gaps are escalated to staff.",
    Icon: ScanSearch,
  },
  {
    title: "Gasless actions",
    text: "ForgeCapita sponsors gas for claiming tokens, staking, voting and executing a milestone.",
    Icon: Fuel,
  },
];

const FAQ: ReadonlyArray<{ q: string; a: string }> = [
  {
    q: "Is this live money?",
    a: "No. ForgeCapita currently runs on Arbitrum Sepolia and BSC Testnet. Everything uses testnet funds with no real value. See the legal page for the full testnet notice.",
  },
  {
    q: "How do I sign in?",
    a: "Connect a wallet and sign a message to prove you own it. There is no password and signing in does not cost anything.",
  },
  {
    q: "What are the fees?",
    a: "A 5% platform fee is taken from the amount raised when a founder closes a successful funding round. The P2P exchange charges a 1% fee on every filled listing. Customer revenue sent to a project is split 24% to the creator, 1% to the platform and 75% to staking investors.",
  },
  {
    q: "How do milestones and refunds work?",
    a: "Raised funds are held in escrow and released milestone by milestone after investors vote to approve each one. If the funding goal is missed, or the founder does not close a successful round in time, backers can reclaim 100% of their deposit. If a project is cancelled or a milestone vote fails, investors can refund their share of the remaining funds.",
  },
  {
    q: "What is a takeover?",
    a: "If a founder abandons a project, ForgeCapita can replace the developer without redeploying contracts. Investors signal support with a vote weighted by staked balance, then the admin executes the handover and the new developer accepts the role.",
  },
  {
    q: "Who can launch a project?",
    a: "Only approved founders. Apply to become a founder from your account, and once your application is approved you can create a project.",
  },
];

interface FeaturedResult {
  projects: ProjectDto[];
  /** Total listed projects from the same call; null when the call failed. */
  total: number | null;
}

async function loadFeatured(): Promise<FeaturedResult> {
  try {
    const res = await listProjects({ limit: FEATURED_LIMIT, offset: 0 });
    return { projects: res.items, total: res.total };
  } catch (err) {
    console.warn("[FeaturedProjects] Unable to load projects:", err);
    return { projects: [], total: null };
  }
}

function FeaturedProjects({ projects, failed }: { projects: ProjectDto[]; failed: boolean }): React.ReactElement {
  if (projects.length > 0) {
    return (
      <div className="project-grid">
        {projects.map((project, i) => (
          <ProjectCard key={project.id} project={project} index={i} />
        ))}
      </div>
    );
  }
  return (
    <Card>
      <EmptyState
        icon={failed ? <SearchX size={20} /> : <Sprout size={20} />}
        title={failed ? "Projects are unavailable right now" : "No projects yet"}
        text={
          failed
            ? "We could not load projects. Please try again in a moment."
            : "There are currently no projects. Approved founders can launch the first one."
        }
      />
    </Card>
  );
}

function StatStrip({ total }: { total: number | null }): React.ReactElement {
  return (
    <div className="stat-strip">
      {total !== null && <StatCard label="Projects listed" value={total} hint="Across both testnets" icon={<Sprout size={16} />} />}
      <StatCard label="Networks" value={2} hint="Arbitrum Sepolia and BSC Testnet" icon={<Network size={16} />} />
      <StatCard label="Revenue to stakers" value="75%" hint="Of customer payments, split on-chain" icon={<Coins size={16} />} />
      <StatCard label="Platform fee" value="5%" hint="Only when a funding round succeeds" icon={<ShieldCheck size={16} />} />
    </div>
  );
}

export default async function HomePage(): Promise<React.ReactElement> {
  const { projects, total } = await loadFeatured();
  return (
    <div className="page-container">
      <section className="home-hero hero-glow fade-in-up" aria-labelledby="hero-heading">
        <StatusPill tone="accent">Live on testnet</StatusPill>
        <h1 id="hero-heading">
          Back the future of <span className="text-accent">Web3 SaaS</span>
        </h1>
        <p className="home-hero-lead">
          Milestone-gated crowdfunding where your investment is protected by governance. Fund, vote, and share in the
          revenue.
        </p>
        <div className="home-actions">
          <ButtonLink href="/projects" size="lg" rightIcon={<ArrowRight size={16} aria-hidden="true" />}>
            Browse projects
          </ButtonLink>
          <ButtonLink href="/how-it-works" variant="secondary" size="lg">
            How it works
          </ButtonLink>
        </div>
        <StatStrip total={total} />
      </section>

      <section className="section" aria-labelledby="how-heading">
        <div className="section-head">
          <div>
            <span className="eyebrow">Three steps</span>
            <h2 id="how-heading">How it works</h2>
            <p>Funding, governance and revenue sharing are enforced by smart contracts.</p>
          </div>
          <ButtonLink href="/how-it-works" variant="ghost" rightIcon={<ArrowRight size={16} aria-hidden="true" />}>
            Full walkthrough
          </ButtonLink>
        </div>
        <div className="feature-grid">
          {STEPS.map(({ title, text, Icon }, i) => (
            <Card key={title} className="feature-card">
              <div className="feature-top">
                <span className="feature-icon" aria-hidden="true">
                  <Icon size={20} />
                </span>
                <span className="feature-step num">Step {i + 1}</span>
              </div>
              <h3>{title}</h3>
              <p>{text}</p>
            </Card>
          ))}
        </div>
      </section>

      <section className="section" aria-labelledby="featured-heading">
        <div className="section-head">
          <div>
            <span className="eyebrow">Marketplace</span>
            <h2 id="featured-heading">Featured projects</h2>
          </div>
          <ButtonLink href="/projects" variant="secondary" rightIcon={<ArrowRight size={16} aria-hidden="true" />}>
            View all projects
          </ButtonLink>
        </div>
        <FeaturedProjects projects={projects} failed={total === null} />
      </section>

      <section className="section" aria-labelledby="trust-heading">
        <div className="section-head">
          <div>
            <span className="eyebrow">Safeguards</span>
            <h2 id="trust-heading">Built for trust</h2>
            <p>Backers keep leverage after they fund, and founders get a transparent path to the money.</p>
          </div>
        </div>
        <div className="trust-grid">
          {TRUST.map(({ title, text, Icon }) => (
            <Card key={title} className="trust-item">
              <span className="feature-icon feature-icon-sm" aria-hidden="true">
                <Icon size={16} />
              </span>
              <div>
                <h3>{title}</h3>
                <p>{text}</p>
              </div>
            </Card>
          ))}
        </div>
      </section>

      <section id="faq" className="section faq-wrap" aria-labelledby="faq-heading">
        <div className="section-head section-head-center">
          <div>
            <span className="eyebrow">FAQ</span>
            <h2 id="faq-heading">Frequently asked questions</h2>
          </div>
        </div>
        <div className="faq-list">
          {FAQ.map(({ q, a }) => (
            <details key={q} className="faq-item">
              <summary>
                {q}
                <ChevronDown size={18} aria-hidden="true" />
              </summary>
              <p>{a}</p>
            </details>
          ))}
        </div>
      </section>

      <section className="cta-band" aria-labelledby="cta-heading">
        <div>
          <h2 id="cta-heading">Ready to back a milestone?</h2>
          <p>Browse live testnet projects, fund the ones you believe in and vote on every release.</p>
        </div>
        <div className="home-actions">
          <ButtonLink href="/projects" rightIcon={<ArrowRight size={16} aria-hidden="true" />}>
            Browse projects
          </ButtonLink>
          <ButtonLink href="/about" variant="secondary">
            About ForgeCapita
          </ButtonLink>
        </div>
      </section>
    </div>
  );
}
