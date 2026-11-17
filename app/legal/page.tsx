import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Legal — ForgeCapita",
  description: "Terms of use and testnet risk notice for ForgeCapita.",
  alternates: { canonical: "/legal" },
};

const h2Style = { fontSize: "24px", fontWeight: 800, margin: "0 0 12px" } as const;
const pStyle = { color: "var(--text-secondary)", fontSize: "15px", lineHeight: 1.7, margin: "0 0 12px" } as const;
const listStyle = { ...pStyle, paddingLeft: "20px" } as const;

export default function LegalPage() {
  return (
    <div style={{ maxWidth: "800px", margin: "0 auto", padding: "48px 24px" }}>
      <h1 style={{ fontSize: "clamp(32px, 4.5vw, 48px)", fontWeight: 900, margin: "0 0 16px", lineHeight: 1.1 }}>
        Legal
      </h1>

      <div className="alert alert-warning" style={{ marginBottom: "24px" }}>
        <span>
          This is a draft that has not yet been reviewed by a lawyer. It may change and should not be relied on as a
          final legal document.
        </span>
      </div>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Testnet notice</h2>
        <p style={pStyle}>
          ForgeCapita currently runs only on test networks (Arbitrum Sepolia and BSC Testnet). Testnet funds and the
          tokens issued by projects have no monetary value and cannot be exchanged for real money. Nothing on this
          site involves real funds.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Not investment advice</h2>
        <p style={pStyle}>
          Nothing on ForgeCapita is investment, financial, legal or tax advice, and nothing is an offer or
          solicitation to buy or sell any security. Project information is provided by the project founders.
        </p>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Risks</h2>
        <ul style={listStyle}>
          <li>Smart-contract risk: the contracts may contain bugs or behave in unexpected ways, and on-chain transactions cannot be reversed.</li>
          <li>Testnet risk: test networks can be reset, paused or discontinued at any time, and data or balances may be lost.</li>
          <li>Project risk: projects can fail, stall or be cancelled, and founders may not deliver what they describe.</li>
          <li>Wallet risk: you are responsible for the security of your wallet and keys.</li>
        </ul>
      </section>

      <section style={{ marginBottom: "24px" }}>
        <h2 style={h2Style}>Terms of use</h2>
        <ul style={listStyle}>
          <li>You use ForgeCapita at your own risk and are responsible for complying with the laws that apply to you.</li>
          <li>The service is provided as is, without warranties of any kind.</li>
          <li>Access to the service, or to individual features, may be changed or withdrawn at any time.</li>
        </ul>
      </section>
    </div>
  );
}
