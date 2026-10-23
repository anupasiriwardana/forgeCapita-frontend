import type { Metadata } from "next";
import { Providers } from "@/components/web3/Providers";
import { Navbar } from "@/components/Navbar";
import "./globals.css";

export const metadata: Metadata = {
  title: "ForgeCapita — Web3 Milestone-Gated Crowdfunding",
  description:
    "ForgeCapita is a decentralized crowdfunding platform where investors fund startups milestone by milestone on Ethereum Sepolia. Invest, vote on milestones, and trade tokens on the P2P market.",
  keywords: ["web3", "crowdfunding", "ethereum", "defi", "startup", "milestone"],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
      </head>
      <body>
        <Providers>
          {/* Ambient glow orbs */}
          <div
            className="glow-orb"
            style={{ width: "600px", height: "600px", background: "#6366f1", top: "-200px", left: "-200px" }}
          />
          <div
            className="glow-orb"
            style={{ width: "500px", height: "500px", background: "#8b5cf6", bottom: "10%", right: "-150px" }}
          />

          <div className="page-wrapper">
            <Navbar />
            <main>{children}</main>
          </div>
        </Providers>
      </body>
    </html>
  );
}
