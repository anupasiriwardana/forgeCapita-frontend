import type { Metadata } from "next";
import Link from "next/link";
import type { ReactNode } from "react";
import { FlaskConical, Milestone, Target, type LucideIcon } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { Card } from "@/components/ui/Card";

export const metadata: Metadata = {
  title: "About — ForgeCapita",
  description: "Why ForgeCapita funds startups in milestones and shares revenue with the people who back them.",
  alternates: { canonical: "/about" },
};

function Section({ title, Icon, children }: { title: string; Icon: LucideIcon; children: ReactNode }): React.ReactElement {
  return (
    <Card className="info-card">
      <h2 className="info-card-title">
        <span className="feature-icon feature-icon-sm" aria-hidden="true">
          <Icon size={16} />
        </span>
        {title}
      </h2>
      {children}
    </Card>
  );
}

export default function AboutPage(): React.ReactElement {
  return (
    <div className="page-container page-container-narrow prose-body">
      <PageHero
        eyebrow="About"
        title="About ForgeCapita"
        intro="Funding for software startups, released in milestones and shared back through revenue."
      />

      <Section title="Our mission" Icon={Target}>
        <p>
          ForgeCapita is a crowdfunding and revenue-sharing protocol for software startups. Its goal is to let
          founders raise money from a community, and to let that community share in the revenue the product earns,
          with the rules enforced by smart contracts instead of promises.
        </p>
      </Section>

      <Section title="Why milestone-governed funding" Icon={Milestone}>
        <p>
          In traditional crowdfunding, founders receive all the money up front and backers have little recourse if
          the project stalls. ForgeCapita holds raised funds in escrow and releases them milestone by milestone, only
          after investors approve each one. The founder&apos;s own tokens vest only when the final milestone is approved,
          and backers can reclaim funds when a project fails or is cancelled.
        </p>
        <p>
          Revenue is shared too. Payments a project receives are split on-chain between the creator, the platform and
          the investors who stake their tokens, so backers benefit when the product succeeds.
        </p>
      </Section>

      <Section title="Current status" Icon={FlaskConical}>
        <p>
          ForgeCapita is running on Arbitrum Sepolia and BSC Testnet only. It uses testnet funds with no real value.
          See the <Link href="/legal" className="text-accent">legal page</Link> for details.
        </p>
      </Section>
    </div>
  );
}
