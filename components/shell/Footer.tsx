import Link from "next/link";

const LINKS: ReadonlyArray<{ href: string; label: string }> = [
  { href: "/projects", label: "Projects" },
  { href: "/how-it-works", label: "How it works" },
  { href: "/about", label: "About" },
  { href: "/legal", label: "Legal" },
  { href: "/#faq", label: "FAQ" },
];

export function Footer() {
  return (
    <footer
      style={{
        borderTop: "1px solid rgba(255,255,255,0.07)",
        padding: "24px",
        textAlign: "center",
        fontSize: "13px",
        color: "rgba(241,245,249,0.5)",
      }}
    >
      <div style={{ fontFamily: "'Space Grotesk', sans-serif", fontWeight: 700, color: "#a78bfa", marginBottom: "4px" }}>
        ForgeCapita
      </div>
      <nav aria-label="Footer" style={{ display: "flex", justifyContent: "center", gap: "16px", flexWrap: "wrap", margin: "8px 0" }}>
        {LINKS.map(({ href, label }) => (
          <Link key={href} href={href} style={{ color: "inherit", textDecoration: "none" }}>
            {label}
          </Link>
        ))}
      </nav>
      <div>Running on Arbitrum Sepolia and BSC Testnet. Testnet funds only, no real value.</div>
      <div style={{ marginTop: "4px" }}>Copyright ForgeCapita. All rights reserved.</div>
    </footer>
  );
}
