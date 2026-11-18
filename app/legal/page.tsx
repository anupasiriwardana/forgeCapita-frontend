import type { Metadata } from "next";
import type { ReactNode } from "react";
import { PageHero } from "@/components/PageHero";
import { Card } from "@/components/ui/Card";
import { InlineAlert } from "@/components/ui/InlineAlert";

export const metadata: Metadata = {
  title: "Legal — ForgeCapita",
  description: "Terms of use and testnet risk notice for ForgeCapita.",
  alternates: { canonical: "/legal" },
};

function Section({ title, children }: { title: string; children: ReactNode }): React.ReactElement {
  return (
    <Card className="info-card">
      <h2 className="info-card-title">{title}</h2>
      {children}
    </Card>
  );
}

export default function LegalPage(): React.ReactElement {
  return (
    <div className="page-container page-container-narrow prose-body">
      <PageHero eyebrow="Legal" title="Legal" intro="Terms of use and testnet risk notice for ForgeCapita." />

      <InlineAlert tone="warning" title="Draft">
        This is a draft that has not yet been reviewed by a lawyer. It may change and should not be relied on as a
        final legal document.
      </InlineAlert>

      <div style={{ marginTop: 16 }}>
        <Section title="Testnet notice">
          <p>
            ForgeCapita currently runs only on test networks (Arbitrum Sepolia and BSC Testnet). Testnet funds and the
            tokens issued by projects have no monetary value and cannot be exchanged for real money. Nothing on this
            site involves real funds.
          </p>
        </Section>

        <Section title="Not investment advice">
          <p>
            Nothing on ForgeCapita is investment, financial, legal or tax advice, and nothing is an offer or
            solicitation to buy or sell any security. Project information is provided by the project founders.
          </p>
        </Section>

        <Section title="Risks">
          <ul>
            <li>Smart-contract risk: the contracts may contain bugs or behave in unexpected ways, and on-chain transactions cannot be reversed.</li>
            <li>Testnet risk: test networks can be reset, paused or discontinued at any time, and data or balances may be lost.</li>
            <li>Project risk: projects can fail, stall or be cancelled, and founders may not deliver what they describe.</li>
            <li>Wallet risk: you are responsible for the security of your wallet and keys.</li>
          </ul>
        </Section>

        <Section title="Terms of use">
          <ul>
            <li>You use ForgeCapita at your own risk and are responsible for complying with the laws that apply to you.</li>
            <li>The service is provided as is, without warranties of any kind.</li>
            <li>Access to the service, or to individual features, may be changed or withdrawn at any time.</li>
          </ul>
        </Section>
      </div>
    </div>
  );
}
