import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, ChevronDown, Coins, SearchX, Sprout, Vote } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { listProjects, type ProjectDto } from "@/lib/api";
import { ProjectCard } from "@/components/ProjectCard";

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

function cardGrid(): React.CSSProperties {
  return { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(320px, 1fr))", gap: "24px" };
}

const linkButton = {
  display: "inline-flex",
  alignItems: "center",
  gap: "8px",
  textDecoration: "none",
  padding: "12px 28px",
  fontSize: "15px",
  fontWeight: 600,
} as const;

async function FeaturedProjects() {
  let projects: ProjectDto[] = [];
  let failed = false;
  try {
    projects = (await listProjects({ limit: FEATURED_LIMIT, offset: 0 })).items;
  } catch (err) {
    failed = true;
    console.warn("[FeaturedProjects] Unable to load projects:", err);
  }

  if (projects.length > 0) {
    return (
      <div style={cardGrid()}>
        {projects.map((project, i) => (
          <ProjectCard key={project.id} project={project} index={i} />
        ))}
      </div>
    );
  }

  return (
    <div
      style={{
        textAlign: "center",
        padding: "56px 24px",
        background: "rgba(255, 255, 255, 0.02)",
        borderRadius: "24px",
        border: "1px dashed rgba(255, 255, 255, 0.12)",
        maxWidth: "600px",
        margin: "0 auto",
      }}
    >
      <div style={{ marginBottom: "12px", color: "var(--text-muted)" }}>
        {failed ? <SearchX size={40} aria-hidden="true" /> : <Sprout size={40} aria-hidden="true" />}
      </div>
      <h3 style={{ fontSize: "20px", fontWeight: 700, marginBottom: "8px", color: "var(--text-primary)" }}>
        {failed ? "Projects are unavailable right now" : "No projects yet"}
      </h3>
      <p style={{ color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.6, margin: 0 }}>
        {failed
          ? "We could not load projects. Please try again in a moment."
          : "There are currently no projects. Approved founders can launch the first one."}
      </p>
    </div>
  );
}

export default function HomePage() {
  return (
    <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "48px 24px" }}>
      <section className="fade-in-up" style={{ textAlign: "center", marginBottom: "72px" }}>
        <span className="section-tag">Live on testnet</span>
        <h1 style={{ fontSize: "clamp(36px, 5vw, 60px)", fontWeight: 900, margin: "0 0 20px", lineHeight: 1.1 }}>
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
          and share in the revenue.
        </p>
        <div style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap" }}>
          <Link href="/projects" className="btn-primary" style={linkButton}>
            Browse projects
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
          <Link href="/how-it-works" className="btn-secondary" style={linkButton}>
            How it works
          </Link>
        </div>
      </section>

      <section aria-labelledby="how-heading" style={{ marginBottom: "72px" }}>
        <h2 id="how-heading" style={{ fontSize: "28px", fontWeight: 800, textAlign: "center", marginBottom: "28px" }}>
          How it works
        </h2>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: "20px" }}>
          {STEPS.map(({ title, text, Icon }) => (
            <div key={title} className="glass-card" style={{ padding: "24px" }}>
              <div style={{ color: "var(--brand-accent)", marginBottom: "12px" }}>
                <Icon size={20} aria-hidden="true" />
              </div>
              <h3 style={{ fontSize: "18px", fontWeight: 700, margin: "0 0 8px" }}>{title}</h3>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.6, margin: 0 }}>{text}</p>
            </div>
          ))}
        </div>
      </section>

      <section aria-labelledby="featured-heading" style={{ marginBottom: "72px" }}>
        <h2 id="featured-heading" style={{ fontSize: "28px", fontWeight: 800, textAlign: "center", marginBottom: "28px" }}>
          Featured projects
        </h2>
        <FeaturedProjects />
        <div style={{ textAlign: "center", marginTop: "28px" }}>
          <Link href="/projects" className="btn-secondary" style={{ ...linkButton, padding: "10px 20px", fontSize: "14px" }}>
            View all projects
            <ArrowRight size={16} aria-hidden="true" />
          </Link>
        </div>
      </section>

      <section id="faq" aria-labelledby="faq-heading" style={{ maxWidth: "800px", margin: "0 auto", scrollMarginTop: "80px" }}>
        <h2 id="faq-heading" style={{ fontSize: "28px", fontWeight: 800, textAlign: "center", marginBottom: "28px" }}>
          Frequently asked questions
        </h2>
        <div style={{ display: "flex", flexDirection: "column", gap: "12px" }}>
          {FAQ.map(({ q, a }) => (
            <details key={q} className="glass-card" style={{ padding: "16px 20px" }}>
              <summary
                style={{
                  cursor: "pointer",
                  fontWeight: 600,
                  fontSize: "16px",
                  color: "var(--text-primary)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: "12px",
                  listStyle: "none",
                }}
              >
                {q}
                <ChevronDown size={16} aria-hidden="true" style={{ flexShrink: 0 }} />
              </summary>
              <p style={{ color: "var(--text-secondary)", fontSize: "14px", lineHeight: 1.7, margin: "12px 0 0" }}>{a}</p>
            </details>
          ))}
        </div>
      </section>
    </div>
  );
}
