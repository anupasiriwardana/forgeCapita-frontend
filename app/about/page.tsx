import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "About — ForgeCapita",
  description: "Why ForgeCapita funds startups in milestones and shares revenue with the people who back them.",
  alternates: { canonical: "/about" },
};

const h2Style = { fontSize: "24px", fontWeight: 800, margin: "0 0 12px" } as const;
const pStyle = { color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.7, margin: "0 0 12px" } as const;

export default function AboutPage() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: "clamp(32px, 4.5vw, 48px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.1 }}>
        About <span className="gradient-text">ForgeCapita</span>
      </h1>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Our mission</h2>
        <p style={pStyle}>
          ForgeCapita is a crowdfunding and revenue-sharing protocol for software startups. Its goal is to let
          founders raise money from a community, and to let that community share in the revenue the product earns,
          with the rules enforced by smart contracts instead of promises.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Why milestone-governed funding</h2>
        <p style={pStyle}>
          In traditional crowdfunding, founders receive all the money up front and backers have little recourse if
          the project stalls. ForgeCapita holds raised funds in escrow and releases them milestone by milestone, only
          after investors approve each one. The founder&apos;s own tokens vest only when the final milestone is approved,
          and backers can reclaim funds when a project fails or is cancelled.
        </p>
        <p style={pStyle}>
          Revenue is shared too. Payments a project receives are split on-chain between the creator, the platform and
          the investors who stake their tokens, so backers benefit when the product succeeds.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Current status</h2>
        <p style={pStyle}>
          ForgeCapita is running on Arbitrum Sepolia and BSC Testnet only. It uses testnet funds with no real value.
          See the legal page for details.
        </p>
      </section>
    </div>
  );
}
