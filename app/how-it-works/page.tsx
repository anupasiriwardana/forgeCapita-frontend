import type { Metadata } from "next";
import type { ReactNode } from "react";
import { ChartPie, Receipt, Rocket, TrendingUp, Vote, type LucideIcon } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { Card } from "@/components/ui/Card";
import { StatCard } from "@/components/ui/StatCard";

export const metadata: Metadata = {
  title: "How it works — ForgeCapita",
  description: "How investors and founders use ForgeCapita: funding, milestone releases, revenue split and fees.",
  alternates: { canonical: "/how-it-works" },
};

const INVESTOR_STEPS: ReadonlyArray<ReactNode> = [
  "Connect a wallet and sign in with a signature. There is no password.",
  "Fund a project during its funding window by sending it testnet ETH or BNB.",
  "If the goal is reached and the founder closes the round, claim your share of the 80% public token supply in proportion to your contribution.",
  "Stake your tokens to vote on milestones and to earn a share of the project's revenue.",
  "If the goal is missed or the project is cancelled, claim a refund.",
];

const FOUNDER_STEPS: ReadonlyArray<ReactNode> = [
  "Apply to become a founder. Only approved founders can launch projects.",
  "Launch a project with a token name and symbol, total supply, funding goal, funding duration and up to 5 sequential milestones whose release percentages add up to 100%.",
  "Twenty percent of the token supply is reserved for the founder and vests only when the final milestone is approved.",
  "When the goal is met, close the funding round to start the milestones. After the deadline there is a 14-day window to close.",
  "Request each milestone release and send customer revenue through the project's revenue router.",
];

function Journey({ title, Icon, steps }: { title: string; Icon: LucideIcon; steps: ReadonlyArray<ReactNode> }): React.ReactElement {
  return (
    <Card className="info-card">
      <h2 className="info-card-title">
        <span className="feature-icon" aria-hidden="true">
          <Icon size={20} />
        </span>
        {title}
      </h2>
      <ol className="step-list">
        {steps.map((step, i) => (
          <li key={i}>
            <span className="step-num num" aria-hidden="true">
              {i + 1}
            </span>
            <span>
              <span className="sr-only">{`Step ${i + 1}: `}</span>
              {step}
            </span>
          </li>
        ))}
      </ol>
    </Card>
  );
}

function InfoSection({ title, Icon, children }: { title: string; Icon: LucideIcon; children: ReactNode }): React.ReactElement {
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

export default function HowItWorksPage(): React.ReactElement {
  return (
    <div className="page-container page-container-medium prose-body">
      <PageHero
        eyebrow="How it works"
        title="How ForgeCapita works"
        intro="ForgeCapita is a milestone-governed crowdfunding and revenue-sharing protocol. It currently runs on Arbitrum Sepolia and BSC Testnet, using testnet funds only."
      />

      <div className="journey-grid">
        <Journey title="For investors" Icon={TrendingUp} steps={INVESTOR_STEPS} />
        <Journey title="For founders" Icon={Rocket} steps={FOUNDER_STEPS} />
      </div>

      <div style={{ marginTop: 16 }}>
        <InfoSection title="Milestone release" Icon={Vote}>
          <p>
            Raised funds are held in escrow. Staked investors vote on each milestone. A milestone is approved
            immediately when yes votes exceed 50% of the public supply. Otherwise, after the 28-day voting period, it is
            approved if participation reaches at least 20% of the public supply and yes votes exceed no votes. If a vote
            fails, the project is cancelled and investors can refund their share of the remaining funds.
          </p>
        </InfoSection>

        <InfoSection title="Revenue split" Icon={ChartPie}>
          <p>
            Customer payments sent to a project are split on-chain: 24% to the creator, 1% to the platform and 75% to
            investors who have staked their tokens. If nobody is staked at the time of payment, the investor share goes
            to the creator.
          </p>
          <div className="split-grid">
            <StatCard label="Staked investors" value="75%" />
            <StatCard label="Creator" value="24%" />
            <StatCard label="Platform" value="1%" />
          </div>
        </InfoSection>

        <InfoSection title="Fees" Icon={Receipt}>
          <ul>
            <li>Funding: a 5% platform fee is taken from the amount raised when a successful round is closed.</li>
            <li>P2P exchange: a 1% fee on every filled listing.</li>
            <li>Gas: ForgeCapita sponsors gas for claiming tokens, staking, voting and executing a milestone. Every other action is paid by the user.</li>
          </ul>
        </InfoSection>
      </div>
    </div>
  );
}
