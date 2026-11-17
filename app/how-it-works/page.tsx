import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "How it works — ForgeCapita",
  description: "How investors and founders use ForgeCapita: funding, milestone releases, revenue split and fees.",
  alternates: { canonical: "/how-it-works" },
};

const h2Style = { fontSize: "24px", fontWeight: 800, margin: "0 0 12px" } as const;
const pStyle = { color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.7, margin: "0 0 12px" } as const;
const listStyle = { ...pStyle, paddingLeft: "20px" } as const;

export default function HowItWorksPage() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: "clamp(32px, 4.5vw, 48px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.1 }}>
        How <span className="gradient-text">ForgeCapita</span> works
      </h1>
      <p style={pStyle}>
        ForgeCapita is a milestone-governed crowdfunding and revenue-sharing protocol. It currently runs on Arbitrum
        Sepolia and BSC Testnet, using testnet funds only.
      </p>

      <section className="glass-card" style={{ padding: "24px", margin: "24px 0" }}>
        <h2 style={h2Style}>For investors</h2>
        <ol style={listStyle}>
          <li>Connect a wallet and sign in with a signature. There is no password.</li>
          <li>Fund a project during its funding window by sending it testnet ETH or BNB.</li>
          <li>If the goal is reached and the founder closes the round, claim your share of the 80% public token supply in proportion to your contribution.</li>
          <li>Stake your tokens to vote on milestones and to earn a share of the project&apos;s revenue.</li>
          <li>If the goal is missed or the project is cancelled, claim a refund.</li>
        </ol>
      </section>

      <section className="glass-card" style={{ padding: "24px", marginBottom: "24px" }}>
        <h2 style={h2Style}>For founders</h2>
        <ol style={listStyle}>
          <li>Apply to become a founder. Only approved founders can launch projects.</li>
          <li>Launch a project with a token name and symbol, total supply, funding goal, funding duration and up to 5 sequential milestones whose release percentages add up to 100%.</li>
          <li>Twenty percent of the token supply is reserved for the founder and vests only when the final milestone is approved.</li>
          <li>When the goal is met, close the funding round to start the milestones. After the deadline there is a 14-day window to close.</li>
          <li>Request each milestone release and send customer revenue through the project&apos;s revenue router.</li>
        </ol>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Milestone release</h2>
        <p style={pStyle}>
          Raised funds are held in escrow. Staked investors vote on each milestone. A milestone is approved
          immediately when yes votes exceed 50% of the public supply. Otherwise, after the 28-day voting period, it is
          approved if participation reaches at least 20% of the public supply and yes votes exceed no votes. If a vote
          fails, the project is cancelled and investors can refund their share of the remaining funds.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Revenue split</h2>
        <p style={pStyle}>
          Customer payments sent to a project are split on-chain: 24% to the creator, 1% to the platform and 75% to
          investors who have staked their tokens. If nobody is staked at the time of payment, the investor share goes
          to the creator.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Fees</h2>
        <ul style={listStyle}>
          <li>Funding: a 5% platform fee is taken from the amount raised when a successful round is closed.</li>
          <li>P2P exchange: a 1% fee on every filled listing.</li>
          <li>Gas: ForgeCapita sponsors gas for claiming tokens, staking, voting and executing a milestone. Every other action is paid by the user.</li>
        </ul>
      </section>
    </div>
  );
}
