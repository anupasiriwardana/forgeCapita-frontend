import Link from "next/link";
import { Zap } from "lucide-react";

type FooterLink = { href: string; label: string };

const PRODUCT: ReadonlyArray<FooterLink> = [
  { href: "/projects", label: "Projects" },
  { href: "/how-it-works", label: "How it works" },
];

const COMPANY: ReadonlyArray<FooterLink> = [
  { href: "/about", label: "About" },
  { href: "/legal", label: "Legal" },
  { href: "/#faq", label: "FAQ" },
];

const NETWORKS: ReadonlyArray<string> = ["Arbitrum Sepolia", "BSC Testnet"];

function LinkColumn({ title, links }: { title: string; links: ReadonlyArray<FooterLink> }): React.ReactElement {
  return (
    <nav aria-label={title}>
      <h2 className="site-footer-heading">{title}</h2>
      <ul className="site-footer-list">
        {links.map(({ href, label }) => (
          <li key={href}>
            <Link href={href}>{label}</Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

export function Footer(): React.ReactElement {
  return (
    <footer className="site-footer">
      <div className="site-footer-inner">
        <div className="site-footer-grid">
          <div className="site-footer-brand">
            <div className="brand-link">
              <span className="brand-mark" aria-hidden="true">
                <Zap size={18} />
              </span>
              <span className="shell-brand-text">ForgeCapita</span>
            </div>
            <p>Milestone-governed crowdfunding and revenue sharing for software startups.</p>
            <p>Running on testnets only. Testnet funds have no real value.</p>
          </div>
          <LinkColumn title="Product" links={PRODUCT} />
          <LinkColumn title="Company" links={COMPANY} />
          <div>
            <h2 className="site-footer-heading">Networks</h2>
            <ul className="site-footer-list">
              {NETWORKS.map((name) => (
                <li key={name}>{name}</li>
              ))}
            </ul>
          </div>
        </div>
        <div className="site-footer-bottom">Copyright ForgeCapita. All rights reserved.</div>
      </div>
    </footer>
  );
}
